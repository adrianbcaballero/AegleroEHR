import io
import base64

import pyotp
import qrcode
from flask import Blueprint, request, g

from extensions import db
from auth_middleware import require_auth, _get_session_id, _validate_session
from models import Tenant
from services.audit_logger import log_access
from services.helpers import client_ip

mfa_bp = Blueprint("mfa", __name__, url_prefix="/api/auth/mfa")


@mfa_bp.get("/setup")
@require_auth()
def mfa_setup():
    """Generate a TOTP secret and QR code for the current user."""
    user = g.user

    # Generate a new secret (or reuse existing if setup was started but not confirmed)
    if not user.mfa_secret:
        user.mfa_secret = pyotp.random_base32()
        db.session.commit()

    tenant = Tenant.query.get(g.tenant_id)
    tenant_name = tenant.name if tenant else "AegleroEMR"

    totp = pyotp.TOTP(user.mfa_secret)
    provisioning_uri = totp.provisioning_uri(
        name=user.username,
        issuer_name=tenant_name,
    )

    # Generate QR code as base64 PNG
    img = qrcode.make(provisioning_uri, box_size=6, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "qrCode": f"data:image/png;base64,{qr_b64}",
        "secret": user.mfa_secret,
    }, 200


@mfa_bp.post("/verify")
@require_auth()
def mfa_verify():
    """Verify a TOTP code and enable MFA for the user."""
    user = g.user
    ip = client_ip()
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip()

    if not code:
        return {"error": "code is required"}, 400

    if not user.mfa_secret:
        return {"error": "MFA setup not started"}, 400

    totp = pyotp.TOTP(user.mfa_secret)
    if not totp.verify(code, valid_window=1):
        log_access(user.id, "MFA_SETUP", "auth/mfa/verify", "FAILED", ip,
                   description=f"MFA setup verification failed for '{user.username}'")
        return {"error": "invalid code"}, 400

    user.mfa_enabled = True
    db.session.commit()

    log_access(user.id, "MFA_SETUP", "auth/mfa/verify", "SUCCESS", ip,
               description=f"MFA enabled for '{user.username}'")

    return {"mfaEnabled": True}, 200


@mfa_bp.post("/disable")
@require_auth()
def mfa_disable():
    """Disable MFA for the current user (only if tenant doesn't require it)."""
    user = g.user
    ip = client_ip()

    tenant = Tenant.query.get(g.tenant_id)
    if tenant and tenant.mfa_required:
        return {"error": "MFA is required by your organization"}, 403

    user.mfa_enabled = False
    user.mfa_secret = None
    db.session.commit()

    log_access(user.id, "MFA_DISABLE", "auth/mfa/disable", "SUCCESS", ip,
               description=f"MFA disabled for '{user.username}'")

    return {"mfaEnabled": False}, 200
