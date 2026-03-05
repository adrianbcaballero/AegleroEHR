from flask import Blueprint, request, g

from auth_middleware import require_auth
from extensions import db
from models import Patient, TreatmentPlan
from services.audit_logger import log_access
from services.helpers import client_ip, parse_date_iso, get_patient_by_id_or_code, check_patient_access, tenant_query
from sqlalchemy.orm.attributes import flag_modified

clinical_bp = Blueprint("clinical", __name__, url_prefix="/api/patients")




def _serialize_plan(tp: TreatmentPlan):
    return {
        "id": tp.id,
        "patientId": tp.patient_id,
        "startDate": tp.start_date.isoformat() if tp.start_date else None,
        "reviewDate": tp.review_date.isoformat() if tp.review_date else None,
        "goals": tp.goals or [],
        "status": tp.status,
        "updatedAt": tp.updated_at.isoformat() if tp.updated_at else None,
    }



# TREATMENT PLAN (single current plan per patient)

@clinical_bp.get("/<patient_id>/treatment-plan")
@require_auth(roles=["technician", "psychiatrist", "admin"])
def get_treatment_plan(patient_id):
    ip = client_ip()

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "TREATMENTPLAN_GET", f"patient/{patient_id}/treatment-plan", "FAILED", ip, description=f"Patient '{patient_id}' not found")
        return {"error": "patient not found"}, 404

    if not check_patient_access(p):
        log_access(g.user.id, "TREATMENTPLAN_GET", f"patient/{p.patient_code}/treatment-plan", "FAILED", ip, description=f"Access denied to treatment plan for patient {p.patient_code}")
        return {"error": "forbidden"}, 403

    tp = TreatmentPlan.query.filter_by(patient_id=p.id).first()

    return {"treatmentPlan": _serialize_plan(tp) if tp else None}, 200


@clinical_bp.post("/<patient_id>/treatment-plan")
@require_auth(roles=["technician", "psychiatrist", "admin"])
def upsert_treatment_plan(patient_id):
    """
    POST acts as create/update:
    - if plan exists: update it
    - else: create it
    """
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "TREATMENTPLAN_UPSERT", f"patient/{patient_id}/treatment-plan", "FAILED", ip, description=f"Treatment plan update failed — patient '{patient_id}' not found")
        return {"error": "patient not found"}, 404

    if not check_patient_access(p):
        log_access(g.user.id, "TREATMENTPLAN_UPSERT", f"patient/{p.patient_code}/treatment-plan", "FAILED", ip, description=f"Access denied to treatment plan for patient {p.patient_code}")
        return {"error": "forbidden"}, 403

    start_date = parse_date_iso(data.get("startDate"))
    review_date = parse_date_iso(data.get("reviewDate"))
    if start_date == "INVALID" or review_date == "INVALID":
        log_access(g.user.id, "TREATMENTPLAN_UPSERT", f"patient/{p.patient_code}/treatment-plan", "FAILED", ip, description=f"Treatment plan update failed for {p.patient_code} — invalid date format")
        return {"error": "startDate/reviewDate must be YYYY-MM-DD"}, 400

    status = (data.get("status") or "active").strip()
    if status not in {"active", "archived"}:
        log_access(g.user.id, "TREATMENTPLAN_UPSERT", f"patient/{p.patient_code}/treatment-plan", "FAILED", ip, description=f"Treatment plan update failed for {p.patient_code} — invalid status")
        return {"error": "status must be active or archived"}, 400

    goals = data.get("goals", [])
    if goals is None:
        goals = []
    if not isinstance(goals, (list, dict)):
        log_access(g.user.id, "TREATMENTPLAN_UPSERT", f"patient/{p.patient_code}/treatment-plan", "FAILED", ip, description=f"Treatment plan update failed for {p.patient_code} — goals must be a list")
        return {"error": "goals must be a list or object"}, 400

    tp = TreatmentPlan.query.filter_by(patient_id=p.id).first()
    created = False
    if not tp:
        tp = TreatmentPlan(patient_id=p.id, tenant_id=g.tenant_id)
        db.session.add(tp)
        created = True

    tp.start_date = start_date
    tp.review_date = review_date
    tp.goals = goals
    tp.status = status
    flag_modified(tp, "goals")

    db.session.commit()

    action_word = "Created" if created else "Updated"
    log_access(g.user.id, "TREATMENTPLAN_UPSERT", f"patient/{p.patient_code}/treatment-plan", "SUCCESS", ip, description=f"{action_word} treatment plan for {p.first_name} {p.last_name} ({p.patient_code})")
    return {"created": created, "treatmentPlan": _serialize_plan(tp)}, 200


@clinical_bp.get("/treatment-plans")
@require_auth(roles=["technician", "psychiatrist", "admin"])
def list_treatment_plans():
    """
    GET /api/patients/treatment-plans
    Returns all treatment plans with patient info.
    """
    ip = client_ip()

    q = db.session.query(TreatmentPlan, Patient).join(Patient, Patient.id == TreatmentPlan.patient_id).filter(TreatmentPlan.tenant_id == g.tenant_id)

    # RBAC: technicians only see assigned patients
    if g.user.role == "technician":
        q = q.filter(Patient.assigned_provider_id == g.user.id)

    rows = q.order_by(Patient.last_name.asc()).all()

    items = []
    for tp, p in rows:
        plan = _serialize_plan(tp)
        plan["patientName"] = f"{p.first_name} {p.last_name}"
        plan["patientCode"] = p.patient_code
        plan["patientStatus"] = p.status
        items.append(plan)

    return items, 200
