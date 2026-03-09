from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, g
from sqlalchemy import func

from auth_middleware import require_auth
from extensions import db
from models import FormTemplate, FormTemplateAccess, PatientForm, Patient, User, Role
from services.audit_logger import log_access
from services.helpers import client_ip, get_patient_by_id_or_code, check_patient_access, tenant_query
from services.asam_scorer import ASAM_TEMPLATE_NAME, DIMENSION_LABELS, LOC_OVERRIDE_LABEL, compute_loc
from sqlalchemy.orm.attributes import flag_modified

forms_bp = Blueprint("forms", __name__, url_prefix="/api")


def _maybe_score_asam(f: PatientForm, p: Patient, template: FormTemplate, ip: str):
    """If this completed form is an ASAM assessment, compute LOC and write it to the patient."""
    if not template or template.name != ASAM_TEMPLATE_NAME:
        return
    try:
        scores = [int(float(f.form_data.get(lbl) or 0)) for lbl in DIMENSION_LABELS]
        override = (f.form_data.get(LOC_OVERRIDE_LABEL) or "").strip()
        if override and override != "No override":
            loc = override.split(" - ")[0].strip()
        else:
            loc = compute_loc(scores)
        p.current_loc = loc
        db.session.commit()
        log_access(g.user.id, "ASAM_SCORE", f"patient/{p.patient_code}", "SUCCESS", ip,
                   description=f"ASAM LOC set to {loc} for {p.first_name} {p.last_name} ({p.patient_code})")
    except Exception:
        pass  # Never let scoring failure block form completion


def _serialize_template(t: FormTemplate):
    return {
        "id": t.id,
        "name": t.name,
        "category": t.category,
        "description": t.description,
        "fields": t.fields or [],
        "allowedRoles": t.allowed_roles or [],
        "status": t.status,
        "isRecurring": t.is_recurring,
        "recurrenceValue": t.recurrence_value,
        "recurrenceUnit": t.recurrence_unit,
        "requiredForAdmission": t.required_for_admission,
        "requiredForDischarge": t.required_for_discharge,
        "createdBy": t.created_by,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
    }


def _serialize_form(f: PatientForm, template: FormTemplate | None = None, filler: User | None = None):
    if template is None:
        template = FormTemplate.query.get(f.template_id)
    if filler is None and f.filled_by:
        filler = User.query.get(f.filled_by)

    template_name = template.name if template else None
    template_category = template.category if template else None
    filler_name = (filler.full_name or filler.username) if filler else None

    return {
        "id": f.id,
        "patientId": f.patient_id,
        "templateId": f.template_id,
        "templateName": template_name,
        "templateCategory": template_category,
        "formData": f.form_data or {},
        "status": f.status,
        "filledBy": f.filled_by,
        "filledByName": filler_name,
        "signatureImage": f.signature_image,
        "signedByName": f.signed_by_name,
        "signedAt": f.signed_at.isoformat() if f.signed_at else None,
        "createdAt": f.created_at.isoformat() if f.created_at else None,
        "updatedAt": f.updated_at.isoformat() if f.updated_at else None,
    }


# ─── TEMPLATE ENDPOINTS (admin + psychiatrist) ───

@forms_bp.get("/templates")
@require_auth(permission="templates.view")
def list_templates():
    ip = client_ip()
    status_filter = (request.args.get("status") or "").strip()

    q = tenant_query(FormTemplate)
    if status_filter:
        q = q.filter(FormTemplate.status == status_filter)

    templates = q.order_by(FormTemplate.name.asc()).all()

    # Bulk count instances per template in one query
    template_ids = [t.id for t in templates]
    counts = dict(
        db.session.query(PatientForm.template_id, func.count(PatientForm.id))
        .filter(PatientForm.template_id.in_(template_ids))
        .group_by(PatientForm.template_id)
        .all()
    ) if template_ids else {}

    result = []
    for t in templates:
        data = _serialize_template(t)
        data["instanceCount"] = counts.get(t.id, 0)
        result.append(data)

    return result, 200


@forms_bp.get("/templates/<int:template_id>")
@require_auth(permission="templates.view")
def get_template(template_id):
    ip = client_ip()
    t = tenant_query(FormTemplate).filter_by(id=template_id).first()
    if not t:
        log_access(g.user.id, "TEMPLATE_GET", f"template/{template_id}", "FAILED", ip, description=f"Template #{template_id} not found")
        return {"error": "template not found"}, 404

    data = _serialize_template(t)
    data["instanceCount"] = PatientForm.query.filter_by(template_id=t.id).count()

    return data, 200


@forms_bp.post("/templates")
@require_auth(permission="templates.manage")
def create_template():
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    name = (data.get("name") or "").strip()
    if not name:
        if not name:
            log_access(g.user.id, "TEMPLATE_CREATE", "templates", "FAILED", ip, description="Template creation failed — name is required")
        return {"error": "name is required"}, 400

    category = (data.get("category") or "").strip()
    if not category:
        log_access(g.user.id, "TEMPLATE_CREATE", "templates", "FAILED", ip, description="Template creation failed — category is required")
        return {"error": "category is required"}, 400

    fields = data.get("fields", [])
    if not isinstance(fields, list):
        log_access(g.user.id, "TEMPLATE_CREATE", "templates", "FAILED", ip, description="Template creation failed — fields must be a list")
        return {"error": "fields must be a list"}, 400

    allowed_roles = data.get("allowedRoles", ["admin", "psychiatrist", "technician"])
    if not isinstance(allowed_roles, list):
        log_access(g.user.id, "TEMPLATE_CREATE", "templates", "FAILED", ip, description="Template creation failed — allowedRoles must be a list")
        return {"error": "allowedRoles must be a list"}, 400

    is_recurring = bool(data.get("isRecurring", False))
    recurrence_value = int(data["recurrenceValue"]) if data.get("recurrenceValue") else None
    recurrence_unit = (data.get("recurrenceUnit") or "").strip() or None
    required_for_admission = bool(data.get("requiredForAdmission", False))
    required_for_discharge = bool(data.get("requiredForDischarge", False))

    t = FormTemplate(
        tenant_id=g.tenant_id,
        name=name,
        category=category,
        description=(data.get("description") or "").strip() or None,
        fields=fields,
        allowed_roles=allowed_roles,
        is_recurring=is_recurring,
        recurrence_value=recurrence_value,
        recurrence_unit=recurrence_unit,
        required_for_admission=required_for_admission,
        required_for_discharge=required_for_discharge,
        status="active",
        created_by=g.user.id,
    )

    db.session.add(t)
    db.session.commit()

    log_access(g.user.id, "TEMPLATE_CREATE", f"template/{t.id}", "SUCCESS", ip, description=f"Created form template '{t.name}' ({t.category})")
    return _serialize_template(t), 201


@forms_bp.put("/templates/<int:template_id>")
@require_auth(permission="templates.manage")
def update_template(template_id):
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    t = tenant_query(FormTemplate).filter_by(id=template_id).first()
    if not t:
        log_access(g.user.id, "TEMPLATE_UPDATE", f"template/{template_id}", "FAILED", ip, description=f"Template update failed — template #{template_id} not found")
        return {"error": "template not found"}, 404

    if "name" in data:
        val = (data["name"] or "").strip()
        if not val:
            return {"error": "name cannot be empty"}, 400
        t.name = val

    if "category" in data:
        t.category = (data["category"] or "").strip()

    if "description" in data:
        t.description = (data["description"] or "").strip() or None

    if "fields" in data:
        if not isinstance(data["fields"], list):
            return {"error": "fields must be a list"}, 400
        t.fields = data["fields"]
        flag_modified(t, "fields")

    if "allowedRoles" in data:
        if not isinstance(data["allowedRoles"], list):
            return {"error": "allowedRoles must be a list"}, 400
        t.allowed_roles = data["allowedRoles"]
        flag_modified(t, "allowed_roles")

    if "status" in data:
        status = (data["status"] or "").strip()
        if status not in {"active", "archived"}:
            return {"error": "status must be active or archived"}, 400
        t.status = status

    if "isRecurring" in data:
        t.is_recurring = bool(data["isRecurring"])
    if "recurrenceValue" in data:
        t.recurrence_value = int(data["recurrenceValue"]) if data["recurrenceValue"] else None
    if "recurrenceUnit" in data:
        t.recurrence_unit = (data["recurrenceUnit"] or "").strip() or None
    if "requiredForAdmission" in data:
        t.required_for_admission = bool(data["requiredForAdmission"])
    if "requiredForDischarge" in data:
        t.required_for_discharge = bool(data["requiredForDischarge"])

    db.session.commit()

    updated_fields = [k for k in data.keys()]
    log_access(g.user.id, "TEMPLATE_UPDATE", f"template/{t.id}", "SUCCESS", ip, description=f"Updated template '{t.name}' — fields: {', '.join(updated_fields)}")
    return _serialize_template(t), 200


@forms_bp.delete("/templates/<int:template_id>")
@require_auth(permission="templates.manage")
def delete_template(template_id):
    ip = client_ip()

    t = tenant_query(FormTemplate).filter_by(id=template_id).first()
    if not t:
        log_access(g.user.id, "TEMPLATE_DELETE", f"template/{template_id}", "FAILED", ip, description=f"Template #{template_id} not found")
        return {"error": "template not found"}, 404

    instance_count = PatientForm.query.filter_by(template_id=t.id).count()
    if instance_count > 0:
        log_access(g.user.id, "TEMPLATE_DELETE", f"template/{template_id}", "FAILED", ip,
                   description=f"Attempted to delete template '{t.name}' which has {instance_count} form instance(s)")
        return {"error": f"Cannot delete — this template has {instance_count} form instance(s). Archive it instead."}, 409

    name = t.name
    db.session.delete(t)
    db.session.commit()
    log_access(g.user.id, "TEMPLATE_DELETE", f"template/{template_id}", "SUCCESS", ip, description=f"Deleted form template '{name}'")
    return {"ok": True}, 200


def _maybe_generate_recurring_forms(p: Patient, user_role: str, tenant_id: int):
    """Lazily create draft forms for any overdue recurring templates."""
    now = datetime.now(timezone.utc)

    recurring_templates = (
        FormTemplate.query
        .filter_by(tenant_id=tenant_id, is_recurring=True, status="active")
        .all()
    )

    created_any = False
    for template in recurring_templates:
        if user_role not in (template.allowed_roles or []):
            continue
        if not template.recurrence_value:
            continue

        interval = timedelta(hours=template.recurrence_value)

        # Skip if there's already an open draft — let staff finish it first
        existing_draft = (
            PatientForm.query
            .filter_by(patient_id=p.id, template_id=template.id, status="draft")
            .first()
        )
        if existing_draft:
            continue

        # Find the most recent form (will be completed or None since no draft exists)
        last_form = (
            PatientForm.query
            .filter_by(patient_id=p.id, template_id=template.id)
            .order_by(PatientForm.created_at.desc())
            .first()
        )

        should_create = False
        if last_form is None:
            should_create = True
        elif last_form.status == "completed":
            reference_time = last_form.signed_at or last_form.updated_at
            if reference_time and (now - reference_time) >= interval:
                should_create = True

        if should_create:
            db.session.add(PatientForm(
                tenant_id=tenant_id,
                patient_id=p.id,
                template_id=template.id,
                form_data={},
                status="draft",
            ))
            created_any = True

    if created_any:
        db.session.commit()


# ─── PATIENT FORM ENDPOINTS ───

@forms_bp.get("/patients/<patient_id>/forms")
@require_auth(permission="forms.view")
def list_patient_forms(patient_id):
    ip = client_ip()

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "FORM_LIST", f"patient/{patient_id}/forms", "FAILED", ip, description=f"Patient '{patient_id}' not found")
        return {"error": "patient not found"}, 404

    if not check_patient_access(p):
        log_access(g.user.id, "FORM_LIST", f"patient/{p.patient_code}/forms", "FAILED", ip, description=f"Access denied to forms for patient {p.patient_code}")
        return {"error": "forbidden"}, 403

    _maybe_generate_recurring_forms(p, g.user.role_name, g.tenant_id)

    forms = (
        PatientForm.query
        .filter_by(patient_id=p.id)
        .order_by(PatientForm.created_at.desc())
        .all()
    )

    # Bulk load all templates and fillers needed
    template_ids = {f.template_id for f in forms}
    user_ids = {f.filled_by for f in forms if f.filled_by}
    templates_map = {t.id: t for t in FormTemplate.query.filter(FormTemplate.id.in_(template_ids)).all()} if template_ids else {}
    users_map = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}

    user_role = g.user.role_name
    result = []
    for f in forms:
        template = templates_map.get(f.template_id)
        if template and user_role in (template.allowed_roles or []):
            filler = users_map.get(f.filled_by) if f.filled_by else None
            result.append(_serialize_form(f, template=template, filler=filler))

    return result, 200


@forms_bp.get("/patients/<patient_id>/forms/<int:form_id>")
@require_auth(permission="forms.view")
def get_patient_form(patient_id, form_id):
    ip = client_ip()

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "FORM_GET", f"patient/{patient_id}/forms/{form_id}", "FAILED", ip, description=f"Patient '{patient_id}' not found")
        return {"error": "patient not found"}, 404

    if not check_patient_access(p):
        log_access(g.user.id, "FORM_GET", f"patient/{p.patient_code}/forms/{form_id}", "FAILED", ip, description=f"Access denied to form #{form_id} for patient {p.patient_code}")
        return {"error": "forbidden"}, 403

    f = PatientForm.query.filter_by(id=form_id, patient_id=p.id).first()
    if not f:
        log_access(g.user.id, "FORM_GET", f"patient/{p.patient_code}/forms/{form_id}", "FAILED", ip, description=f"Form #{form_id} not found for patient {p.patient_code}")
        return {"error": "form not found"}, 404

    # Check role visibility
    template = FormTemplate.query.get(f.template_id)
    if template and g.user.role_name not in (template.allowed_roles or []):
        log_access(g.user.id, "FORM_GET", f"patient/{p.patient_code}/forms/{form_id}", "FAILED", ip, description=f"Role '{g.user.role_name}' not allowed to view form #{form_id}")
        return {"error": "forbidden"}, 403

    filler = User.query.get(f.filled_by) if f.filled_by else None
    data = _serialize_form(f, template=template, filler=filler)
    # Include template fields so frontend can render the form
    data["templateFields"] = template.fields if template else []

    return data, 200


@forms_bp.post("/patients/<patient_id>/forms")
@require_auth(permission="forms.edit")
def create_patient_form(patient_id):
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "FORM_CREATE", f"patient/{patient_id}/forms", "FAILED", ip, description=f"Form creation failed — patient '{patient_id}' not found")
        return {"error": "patient not found"}, 404

    if not check_patient_access(p):
        log_access(g.user.id, "FORM_CREATE", f"patient/{p.patient_code}/forms", "FAILED", ip, description=f"Access denied to create form for patient {p.patient_code}")
        return {"error": "forbidden"}, 403

    template_id = data.get("templateId")
    if not template_id:
        log_access(g.user.id, "FORM_CREATE", f"patient/{p.patient_code}/forms", "FAILED", ip, description="Form creation failed — templateId is required")
        return {"error": "templateId is required"}, 400

    template = tenant_query(FormTemplate).filter_by(id=template_id).first()
    if not template or template.status != "active":
        log_access(g.user.id, "FORM_CREATE", f"patient/{p.patient_code}/forms", "FAILED", ip, description=f"Form creation failed — template #{template_id} not found or archived")
        return {"error": "template not found or archived"}, 404

    form_data = data.get("formData", {})
    if not isinstance(form_data, dict):
        log_access(g.user.id, "FORM_CREATE", f"patient/{p.patient_code}/forms", "FAILED", ip, description="Form creation failed — formData must be an object")
        return {"error": "formData must be an object"}, 400

    status = (data.get("status") or "draft").strip()
    if status not in {"draft", "completed"}:
        log_access(g.user.id, "FORM_CREATE", f"patient/{p.patient_code}/forms", "FAILED", ip, description=f"Form creation failed — invalid status '{status}'")
        return {"error": "status must be draft or completed"}, 400

    f = PatientForm(
        tenant_id=g.tenant_id,
        patient_id=p.id,
        template_id=template_id,
        form_data=form_data,
        status=status,
        filled_by=g.user.id,
    )

    db.session.add(f)
    db.session.commit()

    log_access(g.user.id, "FORM_CREATE", f"patient/{p.patient_code}/forms/{f.id}", "SUCCESS", ip, description=f"Added '{template.name}' form to {p.first_name} {p.last_name} ({p.patient_code})")
    filler = User.query.get(f.filled_by) if f.filled_by else None
    return _serialize_form(f, template=template, filler=filler), 201


@forms_bp.put("/patients/<patient_id>/forms/<int:form_id>")
@require_auth(permission="forms.edit")
def update_patient_form(patient_id, form_id):
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "FORM_UPDATE", f"patient/{patient_id}/forms/{form_id}", "FAILED", ip, description=f"Form update failed — patient '{patient_id}' not found")
        return {"error": "patient not found"}, 404

    if not check_patient_access(p):
        log_access(g.user.id, "FORM_UPDATE", f"patient/{p.patient_code}/forms/{form_id}", "FAILED", ip, description=f"Access denied to update form #{form_id} for patient {p.patient_code}")
        return {"error": "forbidden"}, 403

    f = PatientForm.query.filter_by(id=form_id, patient_id=p.id).first()
    if not f:
        log_access(g.user.id, "FORM_UPDATE", f"patient/{p.patient_code}/forms/{form_id}", "FAILED", ip, description=f"Form #{form_id} not found for patient {p.patient_code}")
        return {"error": "form not found"}, 404

    # Completed forms are legal records and must be immutable
    if f.status == "completed":
        log_access(g.user.id, "FORM_UPDATE", f"patient/{p.patient_code}/forms/{form_id}", "FAILED", ip, description=f"Attempted to modify completed form #{form_id} for patient {p.patient_code}")
        return {"error": "completed forms cannot be modified"}, 409

    if "formData" in data:
        if not isinstance(data["formData"], dict):
            return {"error": "formData must be an object"}, 400
        f.form_data = data["formData"]
        flag_modified(f, "form_data")

    if "status" in data:
        status = (data["status"] or "").strip()
        if status not in {"draft", "completed"}:
            return {"error": "status must be draft or completed"}, 400
        if status == "completed" and not g.user.has_permission("forms.sign"):
            log_access(g.user.id, "FORM_SIGN", f"patient/{p.patient_code}/forms/{f.id}", "FAILED", ip,
                       description=f"Signing denied — missing forms.sign permission")
            return {"error": "forbidden — you do not have permission to sign forms"}, 403
        f.status = status
        if status == "completed" and not f.signed_at:
            f.signed_by_name = g.user.full_name or g.user.username
            f.signed_at = datetime.now(timezone.utc)
            f.signature_image = g.user.signature_data

    db.session.commit()

    template = FormTemplate.query.get(f.template_id)
    tpl_name = template.name if template else f"form #{f.id}"
    if "status" in data and data["status"] == "completed":
        log_access(g.user.id, "FORM_SIGN", f"patient/{p.patient_code}/forms/{f.id}", "SUCCESS", ip, description=f"Signed and completed '{tpl_name}' for {p.first_name} {p.last_name} ({p.patient_code})")
        _maybe_score_asam(f, p, template, ip)
    else:
        log_access(g.user.id, "FORM_UPDATE", f"patient/{p.patient_code}/forms/{f.id}", "SUCCESS", ip, description=f"Saved draft of '{tpl_name}' for {p.first_name} {p.last_name} ({p.patient_code})")
    filler = User.query.get(f.filled_by) if f.filled_by else None
    return _serialize_form(f, template=template, filler=filler), 200

@forms_bp.delete("/patients/<patient_id>/forms/<int:form_id>")
@require_auth(permission="forms.edit")
def delete_patient_form(patient_id, form_id):
    ip = client_ip()

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "FORM_DELETE", f"patient/{patient_id}/forms/{form_id}", "FAILED", ip)
        return {"error": "patient not found"}, 404

    if not check_patient_access(p):
        log_access(g.user.id, "FORM_DELETE", f"patient/{p.patient_code}/forms/{form_id}", "FAILED", ip)
        return {"error": "forbidden"}, 403

    f = PatientForm.query.filter_by(id=form_id, patient_id=p.id).first()
    if not f:
        log_access(g.user.id, "FORM_DELETE", f"patient/{p.patient_code}/forms/{form_id}", "FAILED", ip)
        return {"error": "form not found"}, 404

    template = FormTemplate.query.get(f.template_id) if f else None
    tpl_name = template.name if template else f"form #{form_id}"

    db.session.delete(f)
    db.session.commit()
    log_access(g.user.id, "FORM_DELETE", f"patient/{p.patient_code}/forms/{form_id}", "SUCCESS", ip, description=f"Deleted '{tpl_name}' from {p.first_name} {p.last_name} ({p.patient_code})")
    
    return {"ok": True}, 200
