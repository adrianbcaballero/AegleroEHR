from datetime import datetime, timezone
from flask import Blueprint, request, g
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from auth_middleware import require_auth
from extensions import db
from models import Patient, User, FormTemplate, PatientForm, Bed, CareTeamMember

import re
from services.audit_logger import log_access
from services.helpers import client_ip, parse_date_iso, get_patient_by_id_or_code, check_patient_access, provider_display_name, tenant_query


patients_bp = Blueprint("patients", __name__, url_prefix="/api/patients")

VALID_RISK = {"low", "moderate", "high"}
VALID_STATUS = {"pending", "active", "inactive", "archived"}


def _next_patient_code():
    """
    Generates the next PT-### code based on max existing.
    PT-001, PT-002, ...
    """
    codes = db.session.query(Patient.patient_code).filter(Patient.tenant_id == g.tenant_id).all()
    max_n = 0
    for (code,) in codes:
        if not code:
            continue
        m = re.match(r"^PT-(\d{3,})$", code)
        if m:
            n = int(m.group(1))
            max_n = max(max_n, n)
    return f"PT-{max_n + 1:03d}"


def _serialize_patient(p: Patient):
    #assigned provider display
    provider_name = provider_display_name(p.assigned_provider_id)

    return {
        # frontend uses string IDs like PT-001
        "id": p.patient_code,
        "firstName": p.first_name,
        "lastName": p.last_name,
        "dateOfBirth": p.date_of_birth.isoformat() if p.date_of_birth else None,
        "phone": p.phone,
        "email": p.email,
        "status": p.status,
        "primaryDiagnosis": p.primary_diagnosis,
        "insurance": p.insurance,
        "riskLevel": p.risk_level,
        "assignedProvider": provider_name,
        "ssnLast4": p.ssn_last4,
        "gender": p.gender,
        "pronouns": p.pronouns,
        "maritalStatus": p.marital_status,
        "preferredLanguage": p.preferred_language,
        "ethnicity": p.ethnicity,
        "employmentStatus": p.employment_status,
        "addressStreet": p.address_street,
        "addressCity": p.address_city,
        "addressState": p.address_state,
        "addressZip": p.address_zip,
        "emergencyContactName": p.emergency_contact_name,
        "emergencyContactPhone": p.emergency_contact_phone,
        "emergencyContactRelationship": p.emergency_contact_relationship,
        "currentMedications": p.current_medications,
        "allergies": p.allergies,
        "referringProvider": p.referring_provider,
        "primaryCarePhysician": p.primary_care_physician,
        "pharmacy": p.pharmacy,
        "currentLoc": p.current_loc,
        "assignedBedId": p.assigned_bed_id,
        "admittedAt": p.admitted_at.isoformat() if p.admitted_at else None,
        "dischargedAt": p.discharged_at.isoformat() if p.discharged_at else None,
        "dischargeReason": p.discharge_reason,
        "careTeamId": p.care_team_id,
        "careTeamName": p.care_team.name if p.care_team else None,
    }


def _apply_rbac(query):
    """
    Users without patients.view.all only see:
    - patients with no care team (NULL = open to everyone)
    - patients whose care team they belong to
    """
    if g.user.has_permission("patients.view.all"):
        return query
    member_team_ids = (
        db.session.query(CareTeamMember.care_team_id)
        .filter_by(user_id=g.user.id)
        .subquery()
    )
    return query.filter(
        or_(Patient.care_team_id == None, Patient.care_team_id.in_(member_team_ids))
    )


@patients_bp.get("")
@require_auth(permission="patients.view")
def list_patients():
    """
    GET /api/patients?search=name&status=active&risk_level=high
    """
    search = (request.args.get("search") or "").strip()
    status = (request.args.get("status") or "").strip()
    risk_level = (request.args.get("risk_level") or "").strip()

    q = tenant_query(Patient)
    q = _apply_rbac(q)

    if search:
        # search across first/last name and patient_code
        like = f"%{search}%"
        q = q.filter(
            or_(
                Patient.first_name.ilike(like),
                Patient.last_name.ilike(like),
                Patient.patient_code.ilike(like),
            )
        )

    if status:
        q = q.filter(Patient.status == status)

    if risk_level:
        q = q.filter(Patient.risk_level == risk_level)

    q = q.order_by(Patient.last_name.asc(), Patient.first_name.asc())

    patients = q.all()
    return [_serialize_patient(p) for p in patients], 200


@patients_bp.get("/<patient_id>")
@require_auth(permission="patients.view")
def get_patient(patient_id):
    """
    Supports:
    - /api/patients/PT-001
    - /api/patients/1 (numeric db id)
    """
    ip = client_ip()

    p = get_patient_by_id_or_code(patient_id)

    if not p:
        log_access(g.user.id, "PATIENT_GET", f"patient/{patient_id}", "FAILED", ip, description=f"Patient '{patient_id}' not found")
        return {"error": "patient not found"}, 404

    if not check_patient_access(p):
        log_access(g.user.id, "PATIENT_GET", f"patient/{p.patient_code}", "FAILED", ip, description=f"Access denied to patient {p.patient_code} — not in care team")
        return {"error": "forbidden"}, 403

    log_access(g.user.id, "PATIENT_GET", f"patient/{p.patient_code}", "SUCCESS", ip, description=f"Viewed patient record for {p.first_name} {p.last_name} ({p.patient_code})")

    return _serialize_patient(p), 200



@patients_bp.post("")
@require_auth(permission="patients.create")
def create_patient():
    """
    POST /api/patients
    Body expects camelCase keys like frontend:
    {
      patientCode?:"PT-001",
      firstName, lastName, dateOfBirth?,
      phone?, email?, status?, riskLevel?,
      primaryDiagnosis?, insurance?,
      assignedProviderId? (optional)
    }
    """
    data = request.get_json(silent=True) or {}
    ip = client_ip()

    first_name = (data.get("firstName") or "").strip()
    last_name = (data.get("lastName") or "").strip()

    if not first_name or not last_name:
        log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description="Patient creation failed — missing first or last name")
        return {"error": "firstName and lastName are required"}, 400

    dob = parse_date_iso(data.get("dateOfBirth"))
    if dob == "INVALID":
        log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description="Patient creation failed — invalid date of birth format")
        return {"error": "dateOfBirth must be YYYY-MM-DD"}, 400

    status = (data.get("status") or "pending").strip()
    risk = (data.get("riskLevel") or "low").strip()

    if status not in VALID_STATUS:
        log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description=f"Patient creation failed — invalid status '{status}'")
        return {"error": f"status must be one of {sorted(VALID_STATUS)}"}, 400

    if risk not in VALID_RISK:
        log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description=f"Patient creation failed — invalid risk level '{risk}'")
        return {"error": f"riskLevel must be one of {sorted(VALID_RISK)}"}, 400

    #assigned provider handling
    assigned_provider_id = data.get("assignedProviderId")

    if not g.user.has_permission("patients.view.all"):
        # restricted users can only assign to themselves
        assigned_provider_id = g.user.id

    # If psychiatrist/admin set it, ensure it's valid if provided
    if assigned_provider_id is not None:
        try:
            assigned_provider_id = int(assigned_provider_id)
        except ValueError:
            log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description="Patient creation failed — assignedProviderId must be an integer")
            return {"error": "assignedProviderId must be an integer"}, 400

        if not User.query.filter_by(id=assigned_provider_id, tenant_id=g.tenant_id).first():
            log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description=f"Patient creation failed — provider #{assigned_provider_id} not found")
            return {"error": "assignedProviderId does not exist"}, 400

    patient_code = (data.get("patientCode") or "").strip()
    auto_code = not patient_code
    if patient_code:
        # validate uniqueness if provided
        existing = Patient.query.filter_by(patient_code=patient_code, tenant_id=g.tenant_id).first()
        if existing:
            log_access(g.user.id, "PATIENT_CREATE", f"patient/{patient_code}", "FAILED", ip, description=f"Patient creation failed — code '{patient_code}' already exists")
            return {"error": "patientCode already exists"}, 409
    else:
        patient_code = _next_patient_code()

    # SSN validation (last 4 digits only)
    ssn_last4 = (data.get("ssnLast4") or "").strip()
    if ssn_last4 and (len(ssn_last4) != 4 or not ssn_last4.isdigit()):
        log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description="Patient creation failed — ssnLast4 must be exactly 4 digits")
        return {"error": "ssnLast4 must be exactly 4 digits"}, 400

    p = Patient(
        tenant_id=g.tenant_id,
        patient_code=patient_code,
        first_name=first_name,
        last_name=last_name,
        date_of_birth=dob,
        phone=(data.get("phone") or "").strip() or None,
        email=(data.get("email") or "").strip() or None,
        status=status,
        risk_level=risk,
        primary_diagnosis=(data.get("primaryDiagnosis") or "").strip() or None,
        insurance=(data.get("insurance") or "").strip() or None,
        assigned_provider_id=assigned_provider_id,
        ssn_last4=ssn_last4 or None,
        gender=(data.get("gender") or "").strip() or None,
        pronouns=(data.get("pronouns") or "").strip() or None,
        marital_status=(data.get("maritalStatus") or "").strip() or None,
        preferred_language=(data.get("preferredLanguage") or "").strip() or None,
        ethnicity=(data.get("ethnicity") or "").strip() or None,
        employment_status=(data.get("employmentStatus") or "").strip() or None,
        address_street=(data.get("addressStreet") or "").strip() or None,
        address_city=(data.get("addressCity") or "").strip() or None,
        address_state=(data.get("addressState") or "").strip() or None,
        address_zip=(data.get("addressZip") or "").strip() or None,
        emergency_contact_name=(data.get("emergencyContactName") or "").strip() or None,
        emergency_contact_phone=(data.get("emergencyContactPhone") or "").strip() or None,
        emergency_contact_relationship=(data.get("emergencyContactRelationship") or "").strip() or None,
        current_medications=(data.get("currentMedications") or "").strip() or None,
        allergies=(data.get("allergies") or "").strip() or None,
        referring_provider=(data.get("referringProvider") or "").strip() or None,
        primary_care_physician=(data.get("primaryCarePhysician") or "").strip() or None,
        pharmacy=(data.get("pharmacy") or "").strip() or None,
    )

    for attempt in range(5):
        p.patient_code = patient_code
        db.session.add(p)
        try:
            db.session.commit()
            break
        except IntegrityError:
            db.session.rollback()
            if not auto_code or attempt == 4:
                log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description="Patient creation failed — could not generate a unique patient code")
                return {"error": "could not generate a unique patient code, please try again"}, 500
            patient_code = _next_patient_code()

    log_access(g.user.id, "PATIENT_CREATE", f"patient/{p.patient_code}", "SUCCESS", ip)
    return _serialize_patient(p), 201


@patients_bp.put("/<patient_id>")
@require_auth(permission="patients.edit")
def update_patient(patient_id):
    """
    PUT /api/patients/<PT-001 or db id>
    Body can include any updatable patient fields in camelCase.
    """
    data = request.get_json(silent=True) or {}
    ip = client_ip()

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "PATIENT_UPDATE", f"patient/{patient_id}", "FAILED", ip, description=f"Patient update failed — '{patient_id}' not found")
        return {"error": "patient not found"}, 404

    if not check_patient_access(p):
        log_access(g.user.id, "PATIENT_UPDATE", f"patient/{p.patient_code}", "FAILED", ip, description=f"Access denied to update patient {p.patient_code} — not in care team")
        return {"error": "forbidden"}, 403

    #Update allowed fields
    if "firstName" in data:
        val = (data.get("firstName") or "").strip()
        if not val:
            return {"error": "firstName cannot be empty"}, 400
        p.first_name = val

    if "lastName" in data:
        val = (data.get("lastName") or "").strip()
        if not val:
            return {"error": "lastName cannot be empty"}, 400
        p.last_name = val

    if "dateOfBirth" in data:
        dob = parse_date_iso(data.get("dateOfBirth"))
        if dob == "INVALID":
            return {"error": "dateOfBirth must be YYYY-MM-DD"}, 400
        p.date_of_birth = dob

    if "phone" in data:
        p.phone = (data.get("phone") or "").strip() or None

    if "email" in data:
        p.email = (data.get("email") or "").strip() or None

    if "primaryDiagnosis" in data:
        p.primary_diagnosis = (data.get("primaryDiagnosis") or "").strip() or None

    if "insurance" in data:
        p.insurance = (data.get("insurance") or "").strip() or None

    if "status" in data:
        status = (data.get("status") or "").strip()
        if status not in VALID_STATUS:
            return {"error": f"status must be one of {sorted(VALID_STATUS)}"}, 400
        p.status = status

    if "riskLevel" in data:
        risk = (data.get("riskLevel") or "").strip()
        if risk not in VALID_RISK:
            return {"error": f"riskLevel must be one of {sorted(VALID_RISK)}"}, 400
        p.risk_level = risk

    if "assignedProviderId" in data:
        if not g.user.has_permission("patients.view.all"):
            return {"error": "forbidden — cannot change assignedProviderId"}, 403

        apid = data.get("assignedProviderId")
        if apid is None or apid == "":
            p.assigned_provider_id = None
        else:
            try:
                apid = int(apid)
            except ValueError:
                return {"error": "assignedProviderId must be an integer"}, 400

            if not User.query.filter_by(id=apid, tenant_id=g.tenant_id).first():
                return {"error": "assignedProviderId does not exist"}, 400

            p.assigned_provider_id = apid

    if "ssnLast4" in data:
        val = (data["ssnLast4"] or "").strip()
        if val and (len(val) != 4 or not val.isdigit()):
            return {"error": "ssnLast4 must be exactly 4 digits"}, 400
        p.ssn_last4 = val or None

    if "gender" in data:
        p.gender = (data["gender"] or "").strip() or None

    if "pronouns" in data:
        p.pronouns = (data["pronouns"] or "").strip() or None

    if "maritalStatus" in data:
        p.marital_status = (data["maritalStatus"] or "").strip() or None

    if "preferredLanguage" in data:
        p.preferred_language = (data["preferredLanguage"] or "").strip() or None

    if "ethnicity" in data:
        p.ethnicity = (data["ethnicity"] or "").strip() or None

    if "employmentStatus" in data:
        p.employment_status = (data["employmentStatus"] or "").strip() or None

    if "addressStreet" in data:
        p.address_street = (data["addressStreet"] or "").strip() or None

    if "addressCity" in data:
        p.address_city = (data["addressCity"] or "").strip() or None

    if "addressState" in data:
        p.address_state = (data["addressState"] or "").strip() or None

    if "addressZip" in data:
        p.address_zip = (data["addressZip"] or "").strip() or None

    if "emergencyContactName" in data:
        p.emergency_contact_name = (data["emergencyContactName"] or "").strip() or None

    if "emergencyContactPhone" in data:
        p.emergency_contact_phone = (data["emergencyContactPhone"] or "").strip() or None

    if "emergencyContactRelationship" in data:
        p.emergency_contact_relationship = (data["emergencyContactRelationship"] or "").strip() or None

    if "currentMedications" in data:
        p.current_medications = (data["currentMedications"] or "").strip() or None

    if "allergies" in data:
        p.allergies = (data["allergies"] or "").strip() or None

    if "referringProvider" in data:
        p.referring_provider = (data["referringProvider"] or "").strip() or None

    if "primaryCarePhysician" in data:
        p.primary_care_physician = (data["primaryCarePhysician"] or "").strip() or None

    if "pharmacy" in data:
        p.pharmacy = (data["pharmacy"] or "").strip() or None

    db.session.commit()

    updated_fields = [k for k in data.keys() if k != "patientCode"]
    log_access(g.user.id, "PATIENT_UPDATE", f"patient/{p.patient_code}", "SUCCESS", ip, description=f"Updated patient {p.first_name} {p.last_name} ({p.patient_code}) — fields: {', '.join(updated_fields)}")
    return _serialize_patient(p), 200


# ─── ADMISSION / DISCHARGE ───

VALID_DISCHARGE_REASONS = {"completed", "ama", "transferred", "other"}


@patients_bp.post("/<patient_id>/admit")
@require_auth(permission="frontdesk.patients.pending")
def admit_patient(patient_id):
    ip = client_ip()
    data = request.get_json(silent=True) or {}
    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "PATIENT_ADMIT", f"patient/{patient_id}", "FAILED", ip, description="Patient not found")
        return {"error": "patient not found"}, 404
    if not check_patient_access(p):
        return {"error": "forbidden"}, 403
    if p.status == "active":
        return {"error": "patient is already admitted"}, 409

    # Check all required-for-admission templates have completed forms
    required_templates = (
        FormTemplate.query
        .filter_by(tenant_id=g.tenant_id, required_for_admission=True, status="active")
        .all()
    )
    missing = []
    for tmpl in required_templates:
        completed = PatientForm.query.filter_by(
            patient_id=p.id, template_id=tmpl.id, status="completed"
        ).first()
        if not completed:
            missing.append(tmpl.name)
    if missing:
        return {"error": "Cannot admit — required forms not completed", "missingForms": missing}, 409

    is_readmit = p.status == "inactive"
    p.admitted_at = datetime.now(timezone.utc)
    p.discharged_at = None
    p.discharge_reason = None
    p.status = "active"

    # Optional bed assignment on admit
    bed_id = data.get("bedId")
    if bed_id:
        bed = Bed.query.filter_by(id=bed_id, tenant_id=g.tenant_id, is_active=True).first()
        if not bed:
            return {"error": "bed not found"}, 404
        current = bed.current_patient
        if current and current.status == "active" and current.id != p.id:
            return {"error": f"bed is already occupied by {current.first_name} {current.last_name}"}, 409
        p.assigned_bed_id = bed_id
        bed.status = "available"

    db.session.commit()

    action = "PATIENT_READMIT" if is_readmit else "PATIENT_ADMIT"
    log_access(g.user.id, action, f"patient/{p.patient_code}", "SUCCESS", ip,
               description=f"{'Readmitted' if is_readmit else 'Admitted'} {p.first_name} {p.last_name} ({p.patient_code})")
    return _serialize_patient(p), 200


@patients_bp.post("/<patient_id>/discharge")
@require_auth(permission="archive.manage")
def discharge_patient(patient_id):
    ip = client_ip()
    data = request.get_json(silent=True) or {}

    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "PATIENT_DISCHARGE", f"patient/{patient_id}", "FAILED", ip, description="Patient not found")
        return {"error": "patient not found"}, 404
    if not check_patient_access(p):
        return {"error": "forbidden"}, 403
    if p.status != "active":
        return {"error": "patient is not currently admitted"}, 409

    reason = (data.get("reason") or "other").strip().lower()
    if reason not in VALID_DISCHARGE_REASONS:
        return {"error": f"reason must be one of {sorted(VALID_DISCHARGE_REASONS)}"}, 400

    # Check all required-for-discharge templates have completed forms
    required_templates = (
        FormTemplate.query
        .filter_by(tenant_id=g.tenant_id, required_for_discharge=True, status="active")
        .all()
    )
    missing = []
    for tmpl in required_templates:
        completed = PatientForm.query.filter_by(
            patient_id=p.id, template_id=tmpl.id, status="completed"
        ).first()
        if not completed:
            missing.append(tmpl.name)
    if missing:
        return {"error": "Cannot discharge — required forms not completed", "missingForms": missing}, 409

    p.discharged_at = datetime.now(timezone.utc)
    p.discharge_reason = reason
    p.status = "inactive"

    # Release bed — mark it as cleaning so staff can turn it around
    if p.assigned_bed_id:
        bed = Bed.query.get(p.assigned_bed_id)
        if bed:
            bed.status = "cleaning"
        p.assigned_bed_id = None

    db.session.commit()

    # Auto-create a Discharge Summary draft if the template exists and no open draft
    discharge_template = (
        FormTemplate.query
        .filter_by(tenant_id=g.tenant_id, name="Discharge Summary", status="active")
        .first()
    )
    if discharge_template:
        existing_draft = PatientForm.query.filter_by(
            patient_id=p.id, template_id=discharge_template.id, status="draft"
        ).first()
        if not existing_draft:
            db.session.add(PatientForm(
                tenant_id=g.tenant_id,
                patient_id=p.id,
                template_id=discharge_template.id,
                form_data={},
                status="draft",
            ))
            db.session.commit()

    reason_labels = {"completed": "Completed Treatment", "ama": "AMA", "transferred": "Transferred", "other": "Other"}
    log_access(g.user.id, "PATIENT_DISCHARGE", f"patient/{p.patient_code}", "SUCCESS", ip,
               description=f"Discharged {p.first_name} {p.last_name} ({p.patient_code}) — reason: {reason_labels.get(reason, reason)}")
    return _serialize_patient(p), 200


# ─── ARCHIVE ───

@patients_bp.get("/archive/search")
@require_auth(permission="archive.view")
def search_archive():
    """
    GET /api/patients/archive/search?q=name&ssn=1234
    Searches inactive and archived patients. At least one param required.
    """
    q_str = (request.args.get("q") or "").strip()
    ssn = (request.args.get("ssn") or "").strip()

    if not q_str and not ssn:
        return {"error": "provide at least one search term (q or ssn)"}, 400

    query = tenant_query(Patient).filter(
        Patient.status.in_(["inactive", "archived"])
    )

    if q_str:
        like = f"%{q_str}%"
        query = query.filter(
            or_(
                Patient.first_name.ilike(like),
                Patient.last_name.ilike(like),
                Patient.patient_code.ilike(like),
            )
        )

    if ssn:
        query = query.filter(Patient.ssn_last4 == ssn)

    results = query.order_by(Patient.last_name.asc(), Patient.first_name.asc()).all()
    return [_serialize_patient(p) for p in results], 200

