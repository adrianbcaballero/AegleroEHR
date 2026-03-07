from datetime import datetime, timezone

from flask import Blueprint, request, g

from auth_middleware import require_auth
from extensions import db
from models import Part2Consent
from services.audit_logger import log_access
from services.helpers import client_ip, get_patient_by_id_or_code, check_patient_access

consent_bp = Blueprint("consent", __name__, url_prefix="/api/patients")


def _serialize(c: Part2Consent):
    return {
        "id": c.id,
        "patientId": c.patient_id,
        "receivingParty": c.receiving_party,
        "purpose": c.purpose,
        "informationScope": c.information_scope,
        "expiration": c.expiration,
        "status": c.status,
        "patientSignature": c.patient_signature,
        "signedAt": c.signed_at.isoformat() if c.signed_at else None,
        "revokedAt": c.revoked_at.isoformat() if c.revoked_at else None,
        "revokedBy": c.revoked_by,
        "revocationReason": c.revocation_reason,
        "createdBy": c.created_by,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
    }


@consent_bp.get("/<patient_id>/part2-consents")
@require_auth(permission="consent.manage")
def list_consents(patient_id):
    p = get_patient_by_id_or_code(patient_id)
    if not p:
        return {"error": "patient not found"}, 404
    if not check_patient_access(p):
        return {"error": "forbidden"}, 403

    consents = (
        Part2Consent.query
        .filter_by(patient_id=p.id, tenant_id=g.tenant_id)
        .order_by(Part2Consent.created_at.desc())
        .all()
    )
    return [_serialize(c) for c in consents], 200


@consent_bp.post("/<patient_id>/part2-consents")
@require_auth(permission="consent.manage")
def create_consent(patient_id):
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "PART2_CREATE", f"patient/{patient_id}/part2-consents", "FAILED", ip, description="Patient not found")
        return {"error": "patient not found"}, 404
    if not check_patient_access(p):
        log_access(g.user.id, "PART2_CREATE", f"patient/{p.patient_code}/part2-consents", "FAILED", ip, description="Access denied")
        return {"error": "forbidden"}, 403

    receiving_party = (data.get("receivingParty") or "").strip()
    purpose = (data.get("purpose") or "").strip()
    information_scope = (data.get("informationScope") or "").strip()
    expiration = (data.get("expiration") or "").strip()
    patient_signature = (data.get("patientSignature") or "").strip()

    if not receiving_party:
        return {"error": "receivingParty is required"}, 400
    if not purpose:
        return {"error": "purpose is required"}, 400
    if not information_scope:
        return {"error": "informationScope is required"}, 400
    if not expiration:
        return {"error": "expiration is required"}, 400
    if not patient_signature:
        return {"error": "patientSignature is required"}, 400

    now = datetime.now(timezone.utc)
    c = Part2Consent(
        tenant_id=g.tenant_id,
        patient_id=p.id,
        receiving_party=receiving_party,
        purpose=purpose,
        information_scope=information_scope,
        expiration=expiration,
        status="active",
        patient_signature=patient_signature,
        signed_at=now,
        created_by=g.user.id,
    )
    db.session.add(c)
    db.session.commit()

    log_access(
        g.user.id, "PART2_CREATE", f"patient/{p.patient_code}/part2-consents/{c.id}", "SUCCESS", ip,
        description=f"42 CFR Part 2 consent created for {p.first_name} {p.last_name} — disclosure to '{receiving_party}'"
    )
    return _serialize(c), 201


@consent_bp.post("/<patient_id>/part2-consents/<int:consent_id>/revoke")
@require_auth(permission="consent.manage")
def revoke_consent(patient_id, consent_id):
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        return {"error": "patient not found"}, 404
    if not check_patient_access(p):
        return {"error": "forbidden"}, 403

    c = Part2Consent.query.filter_by(id=consent_id, patient_id=p.id, tenant_id=g.tenant_id).first()
    if not c:
        return {"error": "consent not found"}, 404
    if c.status == "revoked":
        return {"error": "consent already revoked"}, 400

    c.status = "revoked"
    c.revoked_at = datetime.now(timezone.utc)
    c.revoked_by = g.user.id
    c.revocation_reason = (data.get("reason") or "").strip() or None
    db.session.commit()

    log_access(
        g.user.id, "PART2_REVOKE", f"patient/{p.patient_code}/part2-consents/{c.id}", "SUCCESS", ip,
        description=f"42 CFR Part 2 consent #{c.id} revoked for {p.first_name} {p.last_name}"
    )
    return _serialize(c), 200
