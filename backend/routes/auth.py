from datetime import datetime, timedelta, timezone
import secrets

import pyotp
from flask import Blueprint, request, make_response
from werkzeug.security import check_password_hash

from extensions import db
import config
from models import User, UserSession, Tenant, Patient
from services.audit_logger import log_access
from services.rate_limiter import login_limiter
from services.helpers import client_ip, get_slug_from_host
from auth_middleware import _get_session_id, _validate_session

# In-memory store for MFA pending tokens (short-lived, cleared on use)
_mfa_pending: dict[str, dict] = {}

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

    # Check if MFA is required but user hasn't set it up yet
    needs_mfa_setup = tenant.mfa_required and not user.mfa_enabled

    # If user has MFA enabled, require TOTP before creating session
    if user.mfa_enabled:
        mfa_token = secrets.token_urlsafe(32)
        _mfa_pending[mfa_token] = {
            "user_id": user.id,
            "tenant_id": t_id,
            "expires": datetime.now(timezone.utc) + timedelta(minutes=5),
        }
        db.session.commit()
        return {"mfaRequired": True, "mfaToken": mfa_token}, 200

    is_first_login = user.last_login is None
    user.last_login = datetime.now(timezone.utc)
    db.session.commit()

    return _create_session(user, tenant, t_id, ip, is_first_login, needs_mfa_setup)


@auth_bp.post("/login/mfa")
def login_mfa():
    """Complete login by verifying the TOTP code."""
    data = request.get_json(silent=True) or {}
    mfa_token = (data.get("mfaToken") or "").strip()
    code = (data.get("code") or "").strip()
    ip = client_ip()

    if not mfa_token or not code:
        return {"error": "mfaToken and code are required"}, 400

    pending = _mfa_pending.pop(mfa_token, None)
    if not pending or pending["expires"] < datetime.now(timezone.utc):
        _mfa_pending.pop(mfa_token, None)
        return {"error": "MFA session expired, please log in again"}, 401

    user = User.query.get(pending["user_id"])
    if not user or not user.mfa_secret:
        return {"error": "invalid MFA session"}, 401

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(code, valid_window=1):
        # Put the token back so user can retry (within the 5 min window)
        _mfa_pending[mfa_token] = pending
        log_access(user.id, "LOGIN", "auth", "FAILED", ip,
                   description=f"MFA code verification failed for '{user.username}'",
                   tenant_id=pending["tenant_id"])
        return {"error": "invalid code"}, 401

    tenant = Tenant.query.get(pending["tenant_id"])
    is_first_login = user.last_login is None
    user.last_login = datetime.now(timezone.utc)
    db.session.commit()

    return _create_session(user, tenant, pending["tenant_id"], ip, is_first_login, False)


def _create_session(user, tenant, t_id, ip, is_first_login, needs_mfa_setup):
    """Shared helper to create session + cookie after successful authentication."""
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

    resp = make_response({
        "user_id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role_name,
        "roleId": user.role_id,
        "roleDisplayName": user.role_obj.display_name if user.role_obj else None,
        "permissions": user.role_obj.permission_list if user.role_obj else [],
        "credentials": user.credentials or [],
        "tenant_id": t_id,
        "tenant_name": tenant.name,
        "is_first_login": is_first_login,
        "requires_terms_agreement": user.agreed_to_terms_at is None,
        "needsMfaSetup": needs_mfa_setup,
    }, 200)
    resp.set_cookie(
        "session",
        session_id,
        httponly=True,
        secure=config.COOKIE_SECURE,
        samesite="Lax",
        max_age=config.SESSION_TIMEOUT_MINUTES * 60,
    )
    return resp


@auth_bp.post("/accept-terms")
def accept_terms():
    """
    POST /api/auth/accept-terms
    Records that the authenticated user has agreed to the terms.
    """
    session_id = _get_session_id()
    user, _ = _validate_session(session_id)
    if not user:
        return {"error": "not authenticated"}, 401

    if user.agreed_to_terms_at is None:
        user.agreed_to_terms_at = datetime.now(timezone.utc)
        db.session.commit()

    return {"ok": True}, 200


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

    # Sliding session: extend expiration on every /me call so that
    # heartbeat pings from an active frontend keep the session alive.
    sess.expires_at = datetime.now(timezone.utc) + timedelta(minutes=config.SESSION_TIMEOUT_MINUTES)
    db.session.commit()

    tenant = Tenant.query.get(user.tenant_id)
    return {
        "user_id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role_name,
        "roleId": user.role_id,
        "roleDisplayName": user.role_obj.display_name if user.role_obj else None,
        "permissions": user.role_obj.permission_list if user.role_obj else [],
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
    resp = make_response({"ok": True}, 200)
    resp.set_cookie("session", "", httponly=True, secure=config.COOKIE_SECURE, samesite="Lax", max_age=0)
    return resp
