from functools import wraps
from datetime import datetime, timezone

from flask import request, g

from extensions import db
from models import UserSession, User
from services.audit_logger import log_access
from services.helpers import client_ip


def _get_session_id():
    # Prefer httpOnly cookie; fall back to Authorization header for API clients
    cookie = request.cookies.get("session")
    if cookie:
        return cookie
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return None


def _validate_session(session_id: str):
    """
    Returns (user, session) if valid; else (None, None).
    Also deletes expired sessions.
    """
    if not session_id:
        return None, None

    sess = UserSession.query.filter_by(session_id=session_id).first()
    if not sess:
        return None, None

    if sess.expires_at < datetime.now(timezone.utc):
        db.session.delete(sess)
        db.session.commit()
        return None, None

    user = User.query.get(sess.user_id)
    if not user:
        return None, None

    return user, sess


def require_auth(permission=None):
    """
    Decorator that authenticates the request and optionally checks a permission.

    Usage:
        @require_auth()                          # authentication only
        @require_auth(permission="patients.view") # auth + permission check

    The permission is checked against the user's role (via role_obj.has_permission).
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            ip = client_ip()
            session_id = _get_session_id()

            user, sess = _validate_session(session_id)
            if not user:
                return {"error": "not authenticated"}, 401

            g.user = user
            g.tenant_id = user.tenant_id

            if permission is not None and not user.has_permission(permission):
                log_access(
                    user.id, "ACCESS_403", request.path, "FAILED", ip,
                    description=f"'{user.username}' ({user.role_name}) denied — missing permission '{permission}' on {request.method} {request.path}",
                    tenant_id=user.tenant_id
                )
                return {"error": "forbidden"}, 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator
