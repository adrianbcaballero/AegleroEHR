# User management (IT admin)
from flask import Blueprint, request, g
from datetime import datetime, timezone

from auth_middleware import require_auth
from extensions import db
from models import User
from services.audit_logger import log_access
from services.helpers import client_ip, tenant_query
from werkzeug.security import generate_password_hash

users_bp = Blueprint("users", __name__, url_prefix="/api/users")


def _serialize_user(u: User):
    is_temp_locked = bool(u.locked_until and u.locked_until > datetime.now(timezone.utc))
    return {
        "id": u.id,
        "username": u.username,
        "role": u.role,
        "full_name": u.full_name,
        "failed_attempts": u.failed_login_attempts,
        "is_locked": is_temp_locked or u.permanently_locked,
        "permanently_locked": u.permanently_locked,
        "locked_until": u.locked_until.isoformat() if u.locked_until else None,
        "last_login": None,
    }


@users_bp.get("")
@require_auth(permission="users.manage")
def list_users():
    """
    GET /api/users
    Admin only
    """
    users = tenant_query(User).order_by(User.id.asc()).all()

    return [_serialize_user(u) for u in users], 200


@users_bp.post("/<int:user_id>/unlock")
@require_auth(permission="users.manage")
def unlock_user(user_id: int):
    """
    POST /api/users/:id/unlock
    Admin only
    """
    ip = client_ip()
    u = tenant_query(User).filter_by(id=user_id).first()
    if not u:
        log_access(g.user.id, "USER_UNLOCK", f"user/{user_id}", "FAILED", ip, description=f"Failed to unlock user #{user_id} — not found")
        return {"error": "user not found"}, 404

    u.failed_login_attempts = 0
    u.locked_until = None
    u.permanently_locked = False
    db.session.commit()

    log_access(g.user.id, "USER_UNLOCK", f"user/{u.id}", "SUCCESS", ip, description=f"Unlocked account for '{u.username}' ({u.role})")
    return {"ok": True, "user": _serialize_user(u)}, 200


@users_bp.post("/<int:user_id>/lock")
@require_auth(permission="users.manage")
def lock_user(user_id: int):
    """
    POST /api/users/:id/lock
    Permanently lock a user account. Admin only.
    """
    ip = client_ip()
    u = tenant_query(User).filter_by(id=user_id).first()
    if not u:
        log_access(g.user.id, "USER_LOCK", f"user/{user_id}", "FAILED", ip, description=f"Failed to lock user #{user_id} — not found")
        return {"error": "user not found"}, 404

    if u.id == g.user.id:
        log_access(g.user.id, "USER_LOCK", f"user/{user_id}", "FAILED", ip, description="Attempted to lock own account — denied")
        return {"error": "cannot lock your own account"}, 400

    u.permanently_locked = True
    db.session.commit()

    log_access(g.user.id, "USER_LOCK", f"user/{u.id}", "SUCCESS", ip, description=f"Permanently locked account for '{u.username}' ({u.role})")
    return {"ok": True, "user": _serialize_user(u)}, 200


@users_bp.put("/<int:user_id>/reset-password")
@require_auth(permission="users.manage")
def reset_password(user_id: int):
    """
    PUT /api/users/:id/reset-password
    Body: { "new_password": "..." }
    Admin only
    """
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
    db.session.commit()

    log_access(g.user.id, "USER_RESET_PASSWORD", f"user/{u.id}", "SUCCESS", ip, description=f"Reset password for '{u.username}' ({u.role})")
    return {"ok": True}, 200


@users_bp.put("/<int:user_id>")
@require_auth(permission="users.manage")
def update_user(user_id: int):
    """
    PUT /api/users/:id
    Body: { "role": "...", "username": "..." }
    Admin only.
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

    if "role" in data:
        new_role = (data["role"] or "").strip()
        if new_role not in {"admin", "psychiatrist", "technician"}:
            return {"error": "role must be admin, psychiatrist, or technician"}, 400
        if u.id == g.user.id and new_role != u.role:
            log_access(g.user.id, "USER_UPDATE", f"user/{user_id}", "FAILED", ip, description="Attempted to change own role — denied")
            return {"error": "cannot change your own role"}, 400
        changes.append(f"role '{u.role}' → '{new_role}'")
        u.role = new_role

    if "full_name" in data:
        new_name = (data["full_name"] or "").strip()
        changes.append(f"name → '{new_name}'")
        u.full_name = new_name or None

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
    Body: { "username": "...", "password": "...", "role": "...", "full_name": "..." }
    Admin only.
    """
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = (data.get("role") or "").strip()
    full_name = (data.get("full_name") or "").strip() or None

    if not username or len(username) < 3:
        log_access(g.user.id, "USER_CREATE", "users", "FAILED", ip, description="User creation failed — username must be at least 3 characters")
        return {"error": "username must be at least 3 characters"}, 400

    from services.password_validator import validate_password
    is_valid, error_msg = validate_password(password)
    if not is_valid:
        log_access(g.user.id, "USER_CREATE", "users", "FAILED", ip, description=f"User creation failed — {error_msg} for '{username}'")
        return {"error": error_msg}, 400

    if role not in {"admin", "psychiatrist", "technician"}:
        log_access(g.user.id, "USER_CREATE", "users", "FAILED", ip, description=f"User creation failed — invalid role '{role}'")
        return {"error": "role must be admin, psychiatrist, or technician"}, 400

    existing = tenant_query(User).filter_by(username=username).first()
    if existing:
        log_access(g.user.id, "USER_CREATE", "users", "FAILED", ip, description=f"User creation failed — username '{username}' already exists")
        return {"error": "username already exists"}, 409

    u = User(
        tenant_id=g.tenant_id,
        username=username,
        password_hash=generate_password_hash(password),
        role=role,
        full_name=full_name,
    )

    db.session.add(u)
    db.session.commit()

    log_access(g.user.id, "USER_CREATE", f"user/{u.id}", "SUCCESS", ip, description=f"Created user '{u.username}' ({u.role}){' — ' + u.full_name if u.full_name else ''}")
    return {"ok": True, "user": _serialize_user(u)}, 201
