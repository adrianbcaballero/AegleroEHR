from flask import Blueprint, request, g
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from auth_middleware import require_auth
from extensions import db
from models import Patient, User

import re
from services.audit_logger import log_access
from services.helpers import client_ip, parse_date_iso, get_patient_by_id_or_code, check_patient_access, provider_display_name, tenant_query 


patients_bp = Blueprint("patients", __name__, url_prefix="/api/patients")

VALID_RISK = {"low", "moderate", "high"}
VALID_STATUS = {"active", "inactive", "archived"}


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
    }


def _apply_rbac(query):
    """
    technician: only assigned patients
    psychiatrist/admin: all patients
    """
    role = g.user.role
    if role == "technician":
        return query.filter(Patient.assigned_provider_id == g.user.id)
    return query


@patients_bp.get("")
@require_auth(roles=["technician", "psychiatrist", "admin"])
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
@require_auth(roles=["technician", "psychiatrist", "admin"])
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

    if g.user.role == "technician":
        if not p.assigned_provider_id or p.assigned_provider_id != g.user.id:
            log_access(g.user.id, "PATIENT_GET", f"patient/{p.patient_code}", "FAILED", ip, description=f"Access denied to patient {p.patient_code} — not assigned provider")
            return {"error": "forbidden"}, 403

    log_access(g.user.id, "PATIENT_GET", f"patient/{p.patient_code}", "SUCCESS", ip, description=f"Viewed patient record for {p.first_name} {p.last_name} ({p.patient_code})")

    return _serialize_patient(p), 200



@patients_bp.post("")
@require_auth(roles=["technician", "psychiatrist", "admin"])
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

    status = (data.get("status") or "active").strip()
    risk = (data.get("riskLevel") or "low").strip()

    if status not in VALID_STATUS:
        log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description=f"Patient creation failed — invalid status '{status}'")
        return {"error": f"status must be one of {sorted(VALID_STATUS)}"}, 400

    if risk not in VALID_RISK:
        log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description=f"Patient creation failed — invalid risk level '{risk}'")
        return {"error": f"riskLevel must be one of {sorted(VALID_RISK)}"}, 400

    #assigned provider handling
    assigned_provider_id = data.get("assignedProviderId")

    if g.user.role == "technician":
        # technicians can only assign to themselves (or leave null -> force to self)
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
@require_auth(roles=["technician", "psychiatrist", "admin"])
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

    #technician can only update assigned
    if g.user.role == "technician" and p.assigned_provider_id != g.user.id:
        log_access(g.user.id, "PATIENT_UPDATE", f"patient/{p.patient_code}", "FAILED", ip, description=f"Access denied to update patient {p.patient_code} — not assigned provider")
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

    #Provider assignment rules
    if "assignedProviderId" in data:
        if g.user.role == "technician":
            #technicians cannot reassign
            return {"error": "technician cannot change assignedProviderId"}, 403

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

