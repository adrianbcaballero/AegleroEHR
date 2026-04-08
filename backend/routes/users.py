# User management (IT admin)
from flask import Blueprint, request, g
from datetime import datetime, timezone

from auth_middleware import require_auth
from extensions import db
from models import User, UserSession, Role, CareTeam, CareTeamMember, InviteToken
from services.audit_logger import log_access
from services.helpers import client_ip, tenant_query
from werkzeug.security import generate_password_hash

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


def _serialize_user(u: User):
    is_temp_locked = bool(u.locked_until and u.locked_until > datetime.now(timezone.utc))
    care_team_ids = [m.care_team_id for m in CareTeamMember.query.filter_by(user_id=u.id).all()]
    return {
        "id": u.id,
        "username": u.username,
        "roleId": u.role_id,
        "roleName": u.role_obj.name if u.role_obj else None,
        "roleDisplayName": u.role_obj.display_name if u.role_obj else None,
        "credentials": u.credentials or [],
        "full_name": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "failed_attempts": u.failed_login_attempts,
        "is_locked": is_temp_locked or u.permanently_locked,
        "permanently_locked": u.permanently_locked,
        "locked_until": u.locked_until.isoformat() if u.locked_until else None,
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "careTeamIds": care_team_ids,
        "avatar": u.avatar,
        "state_license": u.state_license,
        "npi_number": u.npi_number,
        "dea_number": u.dea_number,
        "primary_license": u.primary_license,
        "secondary_license": u.secondary_license,
        "nadean_number": u.nadean_number,
    }


@users_bp.get("/picker")
@require_auth()
def list_users_picker():
    """GET /api/users/picker — minimal user list for dropdowns (care teams, audit filter, etc.)."""
    users = tenant_query(User).order_by(User.id.asc()).all()
    return [{"id": u.id, "username": u.username, "full_name": u.full_name} for u in users], 200


@users_bp.get("")
@require_auth(permission="users.manage")
def list_users():
    """GET /api/users"""
    users = tenant_query(User).order_by(User.id.asc()).all()
    return [_serialize_user(u) for u in users], 200


@users_bp.post("/<int:user_id>/unlock")
@require_auth(permission="users.manage")
def unlock_user(user_id: int):
    """POST /api/users/:id/unlock"""
    ip = client_ip()
    u = tenant_query(User).filter_by(id=user_id).first()
    if not u:
        log_access(g.user.id, "USER_UNLOCK", f"user/{user_id}", "FAILED", ip, description=f"Failed to unlock user #{user_id} — not found")
        return {"error": "user not found"}, 404

    u.failed_login_attempts = 0
    u.locked_until = None
    u.permanently_locked = False
    db.session.commit()

    log_access(g.user.id, "USER_UNLOCK", f"user/{u.id}", "SUCCESS", ip, description=f"Unlocked account for '{u.username}' ({u.role_name})")
    return {"ok": True, "user": _serialize_user(u)}, 200


@users_bp.post("/<int:user_id>/lock")
@require_auth(permission="users.manage")
def lock_user(user_id: int):
    """POST /api/users/:id/lock — permanently lock an account."""
    ip = client_ip()
    u = tenant_query(User).filter_by(id=user_id).first()
    if not u:
        log_access(g.user.id, "USER_LOCK", f"user/{user_id}", "FAILED", ip, description=f"Failed to lock user #{user_id} — not found")
        return {"error": "user not found"}, 404

    if u.id == g.user.id:
        log_access(g.user.id, "USER_LOCK", f"user/{user_id}", "FAILED", ip, description="Attempted to lock own account — denied")
        return {"error": "cannot lock your own account"}, 400

    u.permanently_locked = True
    # Kill all active sessions so the locked user is forced out immediately
    UserSession.query.filter_by(user_id=u.id).delete()
    db.session.commit()

    log_access(g.user.id, "USER_LOCK", f"user/{u.id}", "SUCCESS", ip, description=f"Permanently locked account for '{u.username}' ({u.role_name}) — all sessions invalidated")
    return {"ok": True, "user": _serialize_user(u)}, 200


@users_bp.put("/<int:user_id>/reset-password")
@require_auth(permission="users.manage")
def reset_password(user_id: int):
    """PUT /api/users/:id/reset-password — Body: { "new_password": "..." }"""
    ip = client_ip()
    data = request.get_json(silent=True) or {}
    new_password = data.get("new_password")

    from services.password_validator import validate_password
    is_valid, error_msg = validate_password(new_password)
    if not is_valid:
        log_access(g.user.id, "USER_RESET_PASSWORD", f"user/{user_id}", "FAILED", ip, description=f"Password reset failed for user #{user_id} — {error_msg}")
        return {"error": error_msg}, 400

    u = tenant_query(User).filter_by(id=user_id).first()
    if not u:
        log_access(g.user.id, "USER_RESET_PASSWORD", f"user/{user_id}", "FAILED", ip, description=f"Password reset failed — user #{user_id} not found")
        return {"error": "user not found"}, 404

    u.password_hash = generate_password_hash(new_password)
    u.failed_login_attempts = 0
    u.locked_until = None
    u.permanently_locked = False
    # Kill all active sessions so the user must re-authenticate with the new password
    UserSession.query.filter_by(user_id=u.id).delete()
    db.session.commit()

    log_access(g.user.id, "USER_RESET_PASSWORD", f"user/{u.id}", "SUCCESS", ip, description=f"Reset password for '{u.username}' ({u.role_name}) — all sessions invalidated")
    return {"ok": True}, 200


@users_bp.put("/<int:user_id>")
@require_auth(permission="users.manage")
def update_user(user_id: int):
    """
    PUT /api/users/:id
    Body: { "roleId": 3, "username": "...", "full_name": "...", "credentials": [...] }
    """
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    u = tenant_query(User).filter_by(id=user_id).first()
    if not u:
        log_access(g.user.id, "USER_UPDATE", f"user/{user_id}", "FAILED", ip, description=f"User #{user_id} not found")
        return {"error": "user not found"}, 404

    changes = []

    if "username" in data:
        new_username = (data["username"] or "").strip()
        if not new_username:
            return {"error": "username cannot be empty"}, 400
        if len(new_username) < 3:
            return {"error": "username must be at least 3 characters"}, 400
        existing = tenant_query(User).filter_by(username=new_username).first()
        if existing and existing.id != u.id:
            log_access(g.user.id, "USER_UPDATE", f"user/{user_id}", "FAILED", ip, description=f"Username '{new_username}' already taken")
            return {"error": "username already exists"}, 409
        changes.append(f"username '{u.username}' → '{new_username}'")
        u.username = new_username

    if "roleId" in data:
        new_role_id = data["roleId"]
        if new_role_id is None:
            return {"error": "roleId cannot be null"}, 400
        try:
            new_role_id = int(new_role_id)
        except (TypeError, ValueError):
            return {"error": "roleId must be an integer"}, 400

        new_role = tenant_query(Role).filter_by(id=new_role_id).first()
        if not new_role:
            return {"error": "role not found"}, 404

        if u.id == g.user.id and new_role_id != u.role_id:
            log_access(g.user.id, "USER_UPDATE", f"user/{user_id}", "FAILED", ip, description="Attempted to change own role — denied")
            return {"error": "cannot change your own role"}, 400

        changes.append(f"role → '{new_role.display_name}'")
        u.role_id = new_role_id

    if "full_name" in data:
        new_name = (data["full_name"] or "").strip()
        if not new_name:
            return {"error": "full name cannot be empty"}, 400
        changes.append(f"name → '{new_name}'")
        u.full_name = new_name

    if "email" in data:
        new_email = (data["email"] or "").strip()
        if not new_email:
            return {"error": "email cannot be empty"}, 400
        changes.append(f"email → '{new_email}'")
        u.email = new_email

    if "phone" in data:
        new_phone = (data["phone"] or "").strip() or None
        changes.append(f"phone → '{new_phone}'")
        u.phone = new_phone

    if "credentials" in data:
        creds = data["credentials"]
        if not isinstance(creds, list):
            return {"error": "credentials must be a list"}, 400
        u.credentials = creds
        changes.append(f"credentials updated")

    for field in ("state_license", "npi_number", "dea_number", "primary_license", "secondary_license", "nadean_number"):
        if field in data:
            val = (data[field] or "").strip() or None
            setattr(u, field, val)
            changes.append(f"{field} updated")

    if not changes:
        return {"error": "no fields to update"}, 400

    db.session.commit()

    log_access(g.user.id, "USER_UPDATE", f"user/{u.id}", "SUCCESS", ip, description=f"Updated user '{u.username}': {', '.join(changes)}")
    return {"ok": True, "user": _serialize_user(u)}, 200


@users_bp.post("/")
@require_auth(permission="users.manage")
def create_user():
    """
    POST /api/users
    Body: { "username": "...", "roleId": 3, "full_name": "...", "credentials": [...],
            "email": "...", "phone": "...",
            "method": "password" | "invite",
            "password": "..." (required when method=password) }
    """
    import secrets
    from datetime import timedelta

    ip = client_ip()
    data = request.get_json(silent=True) or {}

    username = (data.get("username") or "").strip()
    role_id = data.get("roleId")
    full_name = (data.get("full_name") or "").strip() or None
    email = (data.get("email") or "").strip() or None
    phone = (data.get("phone") or "").strip() or None
    credentials = data.get("credentials", [])
    method = (data.get("method") or "password").strip()
    state_license = (data.get("state_license") or "").strip() or None
    npi_number = (data.get("npi_number") or "").strip() or None
    dea_number = (data.get("dea_number") or "").strip() or None
    primary_license = (data.get("primary_license") or "").strip() or None
    secondary_license = (data.get("secondary_license") or "").strip() or None
    nadean_number = (data.get("nadean_number") or "").strip() or None

    if method not in ("password", "invite"):
        return {"error": "method must be 'password' or 'invite'"}, 400

    if not full_name:
        return {"error": "full name is required"}, 400

    if not username or len(username) < 3:
        log_access(g.user.id, "USER_CREATE", "users", "FAILED", ip, description="User creation failed — username must be at least 3 characters")
        return {"error": "username must be at least 3 characters"}, 400

    if not email:
        return {"error": "email is required"}, 400

    # Validate password only for password method
    password_hash = None
    if method == "password":
        password = data.get("password") or ""
        from services.password_validator import validate_password
        is_valid, error_msg = validate_password(password)
        if not is_valid:
            log_access(g.user.id, "USER_CREATE", "users", "FAILED", ip, description=f"User creation failed — {error_msg} for '{username}'")
            return {"error": error_msg}, 400
        password_hash = generate_password_hash(password)

    if not role_id:
        return {"error": "roleId is required"}, 400
    try:
        role_id = int(role_id)
    except (TypeError, ValueError):
        return {"error": "roleId must be an integer"}, 400

    role = tenant_query(Role).filter_by(id=role_id).first()
    if not role:
        log_access(g.user.id, "USER_CREATE", "users", "FAILED", ip, description=f"User creation failed — role #{role_id} not found")
        return {"error": "role not found"}, 404

    if not isinstance(credentials, list):
        return {"error": "credentials must be a list"}, 400

    existing = tenant_query(User).filter_by(username=username).first()
    if existing:
        log_access(g.user.id, "USER_CREATE", "users", "FAILED", ip, description=f"User creation failed — username '{username}' already exists")
        return {"error": "username already exists"}, 409

    u = User(
        tenant_id=g.tenant_id,
        username=username,
        password_hash=password_hash,
        role_id=role_id,
        credentials=credentials,
        full_name=full_name,
        email=email,
        phone=phone,
        state_license=state_license,
        npi_number=npi_number,
        dea_number=dea_number,
        primary_license=primary_license,
        secondary_license=secondary_license,
        nadean_number=nadean_number,
    )

    db.session.add(u)
    db.session.flush()  # get u.id before creating invite token

    result = {"ok": True, "user": _serialize_user(u)}

    if method == "invite":
        token = secrets.token_urlsafe(48)
        invite = InviteToken(
            token=token,
            user_id=u.id,
            tenant_id=g.tenant_id,
            created_by=g.user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=48),
        )
        db.session.add(invite)
        result["inviteToken"] = token
        result["inviteUrl"] = f"/invite?token={token}"

    db.session.commit()

    method_desc = "via invite link" if method == "invite" else "with password"
    log_access(g.user.id, "USER_CREATE", f"user/{u.id}", "SUCCESS", ip,
               description=f"Created user '{u.username}' ({role.display_name}) {method_desc}{' — ' + u.full_name if u.full_name else ''}")
    return result, 201


@users_bp.post("/<int:user_id>/invite")
@require_auth(permission="users.manage")
def generate_invite(user_id: int):
    """
    POST /api/users/:id/invite
    Generates a new invite token for an existing user (replaces any previous one).
    """
    import secrets
    from datetime import timedelta

    ip = client_ip()
    u = tenant_query(User).filter_by(id=user_id).first()
    if not u:
        return {"error": "user not found"}, 404

    # Delete any existing invite tokens for this user
    InviteToken.query.filter_by(user_id=u.id).delete()

    token = secrets.token_urlsafe(48)
    invite = InviteToken(
        token=token,
        user_id=u.id,
        tenant_id=g.tenant_id,
        created_by=g.user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=48),
    )
    db.session.add(invite)
    db.session.commit()

    log_access(g.user.id, "USER_INVITE", f"user/{u.id}", "SUCCESS", ip,
               description=f"Generated invite link for '{u.username}'")
    return {"ok": True, "inviteToken": token, "inviteUrl": f"/invite?token={token}"}, 200


@users_bp.put("/<int:user_id>/careteams")
@require_auth(permission="users.manage")
def update_user_careteams(user_id: int):
    """
    PUT /api/users/:id/careteams
    Body: { "teamIds": [1, 2, 3] }
    Atomically sets the user's care team memberships.
    """
    u = tenant_query(User).filter_by(id=user_id).first()
    if not u:
        return {"error": "user not found"}, 404

    data = request.get_json(silent=True) or {}
    team_ids = data.get("teamIds", [])
    if not isinstance(team_ids, list):
        return {"error": "teamIds must be a list"}, 400

    CareTeamMember.query.filter_by(user_id=u.id).delete()
    for tid in team_ids:
        team = tenant_query(CareTeam).filter_by(id=tid).first()
        if team:
            db.session.add(CareTeamMember(care_team_id=tid, user_id=u.id))

    db.session.commit()
    return {"ok": True}, 200
