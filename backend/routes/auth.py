from datetime import datetime, timedelta, timezone
import secrets

from flask import Blueprint, request
from werkzeug.security import check_password_hash

from extensions import db
import config
from models import User, UserSession, Tenant, Patient
from services.audit_logger import log_access
from services.rate_limiter import login_limiter
from services.helpers import client_ip, get_slug_from_host
from auth_middleware import _get_session_id, _validate_session

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    ip = client_ip()

    tenant_slug = get_slug_from_host()
    tenant = Tenant.query.filter_by(slug=tenant_slug, status="active").first()
    if not tenant:
        return {"error": "invalid clinic URL"}, 400
        
    t_id = tenant.id

    if login_limiter.is_rate_limited(ip):
        log_access(None, "LOGIN", "auth", "FAILED", ip, description=f"Rate limited login attempt for '{username}'", tenant_id=t_id)
        return {"error": "Too many login attempts. Please wait 60 seconds.", "retry_after": 60}, 429

    if not username or not password:
        log_access(None, "LOGIN", "auth", "FAILED", ip, description="Login failed — missing username or password", tenant_id=t_id)
        return {"error": "username and password required"}, 400

    user = User.query.filter_by(username=username, tenant_id=t_id).first()

    if not user:
        log_access(None, "LOGIN", "auth", "FAILED", ip, description=f"Login failed — username '{username}' not found", tenant_id=t_id)
        return {"error": "invalid credentials"}, 401

    if user.permanently_locked:
        log_access(user.id, "LOGIN", "auth", "FAILED", ip, description=f"Login blocked — '{user.username}' is permanently locked", tenant_id=t_id)
        return {"error": "account is permanently locked. contact an administrator"}, 403

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        log_access(user.id, "LOGIN", "auth", "FAILED", ip, description=f"Login blocked — '{user.username}' temporarily locked", tenant_id=t_id)
        return {"error": "account locked. try again later"}, 403

    if not check_password_hash(user.password_hash, password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= config.MAX_FAILED_LOGINS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=config.ACCOUNT_LOCKOUT_MINUTES)
        db.session.commit()
        log_access(user.id, "LOGIN", "auth", "FAILED", ip, description=f"Login failed — wrong password for '{user.username}'", tenant_id=t_id)
        return {"error": "invalid credentials"}, 401

    user.failed_login_attempts = 0
    user.locked_until = None
    db.session.commit()

    session_id = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=config.SESSION_TIMEOUT_MINUTES)

    sess = UserSession(session_id=session_id, user_id=user.id, tenant_id=t_id, expires_at=expires_at)
    db.session.add(sess)
    db.session.commit()

    log_access(user.id, "LOGIN", "auth", "SUCCESS", ip, description=f"User '{user.username}' ({user.role_name}) logged in", tenant_id=t_id)

    # Auto-archive inactive patients discharged 14+ days ago
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    stale = Patient.query.filter_by(tenant_id=t_id, status="inactive").filter(Patient.discharged_at <= cutoff).all()
    for p in stale:
        p.status = "archived"
    if stale:
        db.session.commit()

    return {
        "user_id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role_name,
        "roleId": user.role_id,
        "roleDisplayName": user.role_obj.display_name if user.role_obj else None,
        "credentials": user.credentials or [],
        "tenant_id": t_id,
        "tenant_name": tenant.name,
        "session_id": session_id,
    }, 200


@auth_bp.get("/me")
def me():
    """
    Header: Authorization: Bearer <session_id>
    Returns: {user_id, username, role}
    """
    session_id = _get_session_id()

    user, sess = _validate_session(session_id)
    if not user:
        return {"error": "not authenticated"}, 401

    tenant = Tenant.query.get(user.tenant_id)
    return {
        "user_id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role_name,
        "roleId": user.role_id,
        "roleDisplayName": user.role_obj.display_name if user.role_obj else None,
        "credentials": user.credentials or [],
        "tenant_id": user.tenant_id,
        "tenant_name": tenant.name if tenant else None,
        "signature_data": user.signature_data,
    }, 200


@auth_bp.put("/me/signature")
def update_signature():
    """
    Save or clear the current user's signature.
    Body: { "signature_data": "data:image/png;base64,..." } or { "signature_data": null }
    """
    session_id = _get_session_id()
    user, _ = _validate_session(session_id)
    if not user:
        return {"error": "not authenticated"}, 401

    data = request.get_json(silent=True) or {}
    sig = data.get("signature_data")

    if sig is not None:
        if not isinstance(sig, str):
            return {"error": "signature_data must be a string or null"}, 400
        if not sig.startswith("data:image/png;base64,") and not sig.startswith("data:image/jpeg;base64,"):
            return {"error": "signature_data must be a PNG or JPEG data URL"}, 400
        if len(sig) > 200_000:
            return {"error": "signature image too large"}, 400

    user.signature_data = sig or None
    db.session.commit()
    return {"ok": True}, 200


@auth_bp.post("/logout")
def logout():
    """
    Header: Authorization: Bearer <session_id>
    Deletes session
    """
    session_id = _get_session_id()
    ip = client_ip()

    user, sess = _validate_session(session_id)
    if not sess:
        # No valid session (already logged out or expired)
        return {"ok": True}, 200

    tenant_id = sess.tenant_id
    db.session.delete(sess)
    db.session.commit()

    log_access(user.id, "LOGOUT", "auth", "SUCCESS", ip, description=f"User '{user.username}' logged out", tenant_id=tenant_id)
    return {"ok": True}, 200
