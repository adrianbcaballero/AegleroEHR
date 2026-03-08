from flask import Blueprint, request, g

from auth_middleware import require_auth
from extensions import db
from models import Bed, Patient
from services.audit_logger import log_access
from services.helpers import client_ip, tenant_query

beds_bp = Blueprint("beds", __name__, url_prefix="/api/beds")

VALID_BED_STATUS = {"available", "cleaning", "out_of_service"}


def _serialize_bed(bed: Bed):
    patient = bed.current_patient
    occupied = patient is not None and patient.status == "active"
    return {
        "id": bed.id,
        "unit": bed.unit,
        "room": bed.room,
        "bedLabel": bed.bed_label,
        "displayName": bed.display_name,
        "notes": bed.notes,
        "status": "occupied" if occupied else bed.status,
        "isActive": bed.is_active,
        "sortOrder": bed.sort_order,
        "patient": {
            "id": patient.patient_code,
            "firstName": patient.first_name,
            "lastName": patient.last_name,
            "admittedAt": patient.admitted_at.isoformat() if patient.admitted_at else None,
            "primaryDiagnosis": patient.primary_diagnosis,
            "insurance": patient.insurance,
            "riskLevel": patient.risk_level,
        } if occupied else None,
    }


@beds_bp.get("")
@require_auth(permission="patients.view")
def list_beds():
    """GET /api/beds — active beds with current occupant. Used by bed board."""
    beds = (
        tenant_query(Bed)
        .filter_by(is_active=True)
        .order_by(Bed.unit.asc().nullslast(), Bed.sort_order.asc(), Bed.display_name.asc())
        .all()
    )
    return [_serialize_bed(b) for b in beds], 200


@beds_bp.get("/all")
@require_auth(permission="roles.manage")
def list_all_beds():
    """GET /api/beds/all — all beds including decommissioned. Admin/settings use."""
    beds = (
        tenant_query(Bed)
        .order_by(Bed.unit.asc().nullslast(), Bed.sort_order.asc(), Bed.display_name.asc())
        .all()
    )
    return [_serialize_bed(b) for b in beds], 200


@beds_bp.post("")
@require_auth(permission="roles.manage")
def create_bed():
    """POST /api/beds — create a new bed in the tenant's inventory."""
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    display_name = (data.get("displayName") or "").strip()
    if not display_name:
        return {"error": "displayName is required"}, 400

    bed = Bed(
        tenant_id=g.tenant_id,
        unit=(data.get("unit") or "").strip() or None,
        room=(data.get("room") or "").strip() or None,
        bed_label=(data.get("bedLabel") or "").strip() or None,
        display_name=display_name,
        notes=(data.get("notes") or "").strip() or None,
        sort_order=int(data.get("sortOrder") or 0),
    )
    db.session.add(bed)
    db.session.commit()

    log_access(g.user.id, "BED_CREATE", f"bed/{bed.id}", "SUCCESS", ip,
               description=f"Created bed '{bed.display_name}'"
               + (f" in unit '{bed.unit}'" if bed.unit else ""))
    return _serialize_bed(bed), 201


@beds_bp.put("/<int:bed_id>")
@require_auth(permission="roles.manage")
def update_bed(bed_id):
    """PUT /api/beds/<id> — update bed config or status."""
    ip = client_ip()
    bed = tenant_query(Bed).filter_by(id=bed_id).first()
    if not bed:
        return {"error": "bed not found"}, 404

    data = request.get_json(silent=True) or {}
    changes = []

    if "displayName" in data:
        v = (data["displayName"] or "").strip()
        if not v:
            return {"error": "displayName cannot be empty"}, 400
        bed.display_name = v
        changes.append(f"displayName='{v}'")

    if "unit" in data:
        bed.unit = (data["unit"] or "").strip() or None
        changes.append("unit updated")

    if "room" in data:
        bed.room = (data["room"] or "").strip() or None

    if "bedLabel" in data:
        bed.bed_label = (data["bedLabel"] or "").strip() or None

    if "notes" in data:
        bed.notes = (data["notes"] or "").strip() or None

    if "status" in data:
        status = (data["status"] or "").strip()
        if status not in VALID_BED_STATUS:
            return {"error": f"status must be one of: {', '.join(sorted(VALID_BED_STATUS))}"}, 400
        patient = bed.current_patient
        if patient and patient.status == "active":
            return {"error": "cannot change status of an occupied bed"}, 409
        bed.status = status
        changes.append(f"status={status}")

    if "isActive" in data:
        bed.is_active = bool(data["isActive"])
        changes.append(f"isActive={bed.is_active}")

    if "sortOrder" in data:
        bed.sort_order = int(data.get("sortOrder") or 0)

    db.session.commit()
    if changes:
        log_access(g.user.id, "BED_UPDATE", f"bed/{bed.id}", "SUCCESS", ip,
                   description=f"Updated bed '{bed.display_name}': {', '.join(changes)}")
    return _serialize_bed(bed), 200


@beds_bp.delete("/<int:bed_id>")
@require_auth(permission="roles.manage")
def delete_bed(bed_id):
    """DELETE /api/beds/<id> — delete a bed if it is not occupied."""
    ip = client_ip()
    bed = tenant_query(Bed).filter_by(id=bed_id).first()
    if not bed:
        return {"error": "bed not found"}, 404

    patient = bed.current_patient
    if patient and patient.status == "active":
        return {"error": "cannot delete an occupied bed — discharge the patient first"}, 409

    name = bed.display_name
    db.session.delete(bed)
    db.session.commit()

    log_access(g.user.id, "BED_DELETE", f"bed/{bed_id}", "SUCCESS", ip,
               description=f"Deleted bed '{name}'")
    return {"ok": True}, 200


@beds_bp.put("/<int:bed_id>/assign")
@require_auth(permission="patients.admit")
def assign_bed(bed_id):
    """
    PUT /api/beds/<id>/assign
    Body: { "patientCode": "PT-001" }  — assign patient to this bed
    Body: {}                           — unassign (set bed to cleaning)
    """
    ip = client_ip()
    bed = tenant_query(Bed).filter_by(id=bed_id, is_active=True).first()
    if not bed:
        return {"error": "bed not found"}, 404

    data = request.get_json(silent=True) or {}
    patient_code = (data.get("patientCode") or "").strip() or None

    if patient_code:
        patient = Patient.query.filter_by(
            tenant_id=g.tenant_id, patient_code=patient_code
        ).first()
        if not patient:
            return {"error": "patient not found"}, 404
        if patient.status != "active":
            return {"error": "patient is not currently admitted"}, 409

        current = bed.current_patient
        if current and current.status == "active" and current.id != patient.id:
            return {
                "error": f"bed is already occupied by {current.first_name} {current.last_name}"
            }, 409

        # If patient was in another bed, mark that bed as cleaning
        if patient.assigned_bed_id and patient.assigned_bed_id != bed_id:
            old_bed = Bed.query.get(patient.assigned_bed_id)
            if old_bed:
                old_bed.status = "cleaning"

        patient.assigned_bed_id = bed_id
        bed.status = "available"  # "occupied" is derived; reset any cleaning/OOS flag
        db.session.commit()

        log_access(g.user.id, "BED_ASSIGN", f"bed/{bed_id}", "SUCCESS", ip,
                   description=f"Assigned {patient.first_name} {patient.last_name} "
                   f"({patient.patient_code}) to bed '{bed.display_name}'")
    else:
        current = bed.current_patient
        if current and current.status == "active":
            log_access(g.user.id, "BED_UNASSIGN", f"bed/{bed_id}", "SUCCESS", ip,
                       description=f"Unassigned {current.first_name} {current.last_name} "
                       f"from bed '{bed.display_name}'")
            current.assigned_bed_id = None
            bed.status = "cleaning"
            db.session.commit()

    return _serialize_bed(bed), 200
