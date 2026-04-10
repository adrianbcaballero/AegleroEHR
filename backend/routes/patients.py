from datetime import datetime, timezone
from flask import Blueprint, request, g
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from auth_middleware import require_auth
from extensions import db
from models import Patient, Episode, User, FormTemplate, PatientForm, Bed, CareTeam, CareTeamMember

import base64
import re
from services.audit_logger import log_access

ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_PHOTO_BYTES = 2 * 1024 * 1024  # 2 MB decoded


def _validate_photo(data_url: str) -> str | None:
    """Validate a base64 data-URL image. Returns error string or None if valid."""
    if not data_url.startswith("data:"):
        return "photo must be a data URL"
    try:
        header, encoded = data_url.split(",", 1)
    except ValueError:
        return "invalid data URL format"
    mime = header.split(";")[0].replace("data:", "")
    if mime not in ALLOWED_PHOTO_TYPES:
        return f"photo type '{mime}' not allowed — use JPEG, PNG, or WebP"
    try:
        raw = base64.b64decode(encoded)
    except Exception:
        return "invalid base64 encoding"
    if len(raw) > MAX_PHOTO_BYTES:
        return "photo exceeds 2 MB limit"
    return None
from services.helpers import client_ip, parse_date_iso, get_patient_by_id_or_code, check_patient_access, provider_display_name, tenant_query


patients_bp = Blueprint("patients", __name__, url_prefix="/api/patients")

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

    ep = p.current_episode
    admitted_at = ep.admitted_at if ep else None
    discharged_at = ep.discharged_at if ep else None
    discharge_reason = ep.discharge_reason if ep else None
    assigned_bed_id = ep.assigned_bed_id if ep else None
    episode_count = p.episodes.count() if p.current_episode_id else 0

    return {
        # frontend uses string IDs like PT-001
        "id": p.patient_code,
        "firstName": p.first_name,
        "lastName": p.last_name,
        "dateOfBirth": p.date_of_birth.isoformat() if p.date_of_birth else None,
        "phone": p.phone,
        "email": p.email,
        "status": p.status,
        "primaryDiagnosis": (ep.primary_diagnosis if ep else None) or p.primary_diagnosis,
        "insurance": p.insurance,
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
        "acuityFlags": p.acuity_flags,
        "assignedBedId": assigned_bed_id,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "admittedAt": admitted_at.isoformat() if admitted_at else None,
        "readmissionCount": p.readmission_count,
        "dischargedAt": discharged_at.isoformat() if discharged_at else None,
        "dischargeReason": discharge_reason,
        "careTeamId": p.care_team_id,
        "careTeamName": p.care_team.name if p.care_team else None,
        "photo": p.photo,
        # Episode fields
        "episodeId": ep.id if ep else None,
        "episodeNumber": ep.episode_number if ep else None,
        "episodeCount": episode_count,
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
        .scalar_subquery()
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

    q = tenant_query(Patient)
    q = _apply_rbac(q)

    if search:
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

    q = q.order_by(Patient.last_name.asc(), Patient.first_name.asc())

    patients = q.all()
    return [_serialize_patient(p) for p in patients], 200


@patients_bp.get("/pending")
@require_auth(permission="frontdesk.view")
def list_pending_patients():
    """GET /api/patients/pending — only pending patients, for front desk view."""
    q = tenant_query(Patient).filter(Patient.status == "pending")
    q = q.order_by(Patient.last_name.asc(), Patient.first_name.asc())
    return [_serialize_patient(p) for p in q.all()], 200


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



@patients_bp.post("/check-duplicate")
@require_auth(permission="frontdesk.patients.create")
def check_duplicate():
    """
    POST /api/patients/check-duplicate
    Body: { firstName, lastName, dateOfBirth?, ssnLast4? }
    Returns matching existing patients so front desk can avoid duplicates.
    """
    data = request.get_json(silent=True) or {}
    first_name = (data.get("firstName") or "").strip().lower()
    last_name = (data.get("lastName") or "").strip().lower()
    dob = (data.get("dateOfBirth") or "").strip() or None
    ssn = (data.get("ssnLast4") or "").strip() or None

    if not first_name or not last_name:
        return {"matches": []}, 200

    query = tenant_query(Patient)
    matches = []

    # Match by name + DOB (strongest match)
    if dob:
        parsed = parse_date_iso(dob)
        if parsed and parsed != "INVALID":
            name_dob = query.filter(
                db.func.lower(Patient.first_name) == first_name,
                db.func.lower(Patient.last_name) == last_name,
                Patient.date_of_birth == parsed,
            ).all()
            matches.extend(name_dob)

    # Match by SSN last 4 (if provided and not already matched)
    if ssn and len(ssn) == 4:
        matched_ids = {m.id for m in matches}
        ssn_matches = query.filter(Patient.ssn_last4 == ssn).all()
        matches.extend(m for m in ssn_matches if m.id not in matched_ids)

    # Fuzzy: same name without DOB (weaker signal, only if no DOB provided)
    if not dob and not ssn:
        name_only = query.filter(
            db.func.lower(Patient.first_name) == first_name,
            db.func.lower(Patient.last_name) == last_name,
        ).all()
        matched_ids = {m.id for m in matches}
        matches.extend(m for m in name_only if m.id not in matched_ids)

    return {"matches": [
        {
            "id": p.patient_code,
            "firstName": p.first_name,
            "lastName": p.last_name,
            "dateOfBirth": p.date_of_birth.isoformat() if p.date_of_birth else None,
            "ssnLast4": p.ssn_last4,
            "status": p.status,
            "admittedAt": (p.current_episode.admitted_at.isoformat()
                           if p.current_episode and p.current_episode.admitted_at else None),
            "dischargedAt": (p.current_episode.discharged_at.isoformat()
                              if p.current_episode and p.current_episode.discharged_at else None),
            "readmissionCount": p.readmission_count,
        }
        for p in matches
    ]}, 200


@patients_bp.post("")
@require_auth(permission="frontdesk.patients.create")
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

    if status not in VALID_STATUS:
        log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description=f"Patient creation failed — invalid status '{status}'")
        return {"error": f"status must be one of {sorted(VALID_STATUS)}"}, 400

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

    # Care team assignment (optional)
    care_team_id = data.get("careTeamId")
    if care_team_id is not None:
        try:
            care_team_id = int(care_team_id)
        except (ValueError, TypeError):
            log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description="Patient creation failed — careTeamId must be an integer")
            return {"error": "careTeamId must be an integer"}, 400
        if not CareTeam.query.filter_by(id=care_team_id, tenant_id=g.tenant_id).first():
            log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description=f"Patient creation failed — care team #{care_team_id} not found")
            return {"error": "careTeamId does not exist"}, 400

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

    # Validate photo if provided
    photo_data = data.get("photo")
    if photo_data:
        photo_err = _validate_photo(photo_data)
        if photo_err:
            log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description=f"Patient creation failed — {photo_err}")
            return {"error": photo_err}, 400

    p = Patient(
        tenant_id=g.tenant_id,
        patient_code=patient_code,
        first_name=first_name,
        last_name=last_name,
        date_of_birth=dob,
        phone=(data.get("phone") or "").strip() or None,
        email=(data.get("email") or "").strip() or None,
        status=status,
        primary_diagnosis=(data.get("primaryDiagnosis") or "").strip() or None,
        insurance=(data.get("insurance") or "").strip() or None,
        assigned_provider_id=assigned_provider_id,
        care_team_id=care_team_id,
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
        photo=photo_data or None,
    )

    for attempt in range(5):
        p.patient_code = patient_code
        db.session.add(p)
        try:
            db.session.flush()
            break
        except IntegrityError:
            db.session.rollback()
            if not auto_code or attempt == 4:
                log_access(g.user.id, "PATIENT_CREATE", "patient", "FAILED", ip, description="Patient creation failed — could not generate a unique patient code")
                return {"error": "could not generate a unique patient code, please try again"}, 500
            patient_code = _next_patient_code()

    # Create Episode #1 for this patient
    ep = Episode(
        tenant_id=g.tenant_id,
        patient_id=p.id,
        episode_number=1,
        status=status,
        primary_diagnosis=p.primary_diagnosis,
    )
    db.session.add(ep)
    db.session.flush()
    p.current_episode_id = ep.id
    db.session.commit()

    log_access(g.user.id, "PATIENT_CREATE", f"patient/{p.patient_code}", "SUCCESS", ip,
               description=f"Registered {p.first_name} {p.last_name} ({p.patient_code}) — Episode #1 created")
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

    if "careTeamId" in data:
        ctid = data.get("careTeamId")
        if ctid is None or ctid == "":
            p.care_team_id = None
        else:
            try:
                ctid = int(ctid)
            except (ValueError, TypeError):
                return {"error": "careTeamId must be an integer"}, 400
            if not CareTeam.query.filter_by(id=ctid, tenant_id=g.tenant_id).first():
                return {"error": "careTeamId does not exist"}, 400
            p.care_team_id = ctid

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

    VALID_ACUITY_FLAGS = {
        "seizure_history", "cardiac_risk", "fall_risk", "suicide_risk",
        "withdrawal_severe", "pregnancy", "infectious", "elopement_risk",
    }
    if "acuityFlags" in data:
        flags = data["acuityFlags"]
        if flags is not None:
            if not isinstance(flags, dict):
                return {"error": "acuityFlags must be an object"}, 400
            for key, val in flags.items():
                if key not in VALID_ACUITY_FLAGS:
                    return {"error": f"unknown acuity flag: {key}"}, 400
                if not isinstance(val, dict) or "active" not in val:
                    return {"error": f"each flag must have {{active, description?}}"}, 400
            p.acuity_flags = flags
        else:
            p.acuity_flags = None

    if "photo" in data:
        photo_data = data["photo"]
        if photo_data:
            photo_err = _validate_photo(photo_data)
            if photo_err:
                return {"error": photo_err}, 400
            p.photo = photo_data
        else:
            p.photo = None  # allow clearing the photo

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
    if p.status == "inactive":
        return {"error": "patient is discharged — use readmit first"}, 409

    ep = p.current_episode
    if not ep:
        return {"error": "no current episode found for patient"}, 500

    # Check all required-for-admission templates have completed forms for THIS episode
    required_templates = (
        FormTemplate.query
        .filter_by(tenant_id=g.tenant_id, required_for_admission=True, status="active")
        .all()
    )
    missing = []
    for tmpl in required_templates:
        completed = PatientForm.query.filter(
            PatientForm.patient_id == p.id,
            PatientForm.template_id == tmpl.id,
            PatientForm.status == "completed",
            # Scope to current episode; also match legacy forms with no episode_id
            db.or_(PatientForm.episode_id == ep.id, PatientForm.episode_id.is_(None)),
        ).first()
        if not completed:
            missing.append(tmpl.name)
    if missing:
        return {"error": "Cannot admit — required forms not completed", "missingForms": missing}, 409

    now = datetime.now(timezone.utc)

    ep.admitted_at = now
    ep.status = "active"
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
        ep.assigned_bed_id = bed_id
        bed.status = "available"

    db.session.commit()

    desc = f"Admitted {p.first_name} {p.last_name} ({p.patient_code}) — Episode #{ep.episode_number}"
    if bed_id and ep.assigned_bed_id:
        bed_obj = Bed.query.get(bed_id)
        if bed_obj:
            desc += f", assigned to bed '{bed_obj.display_name}'"
    log_access(g.user.id, "PATIENT_ADMIT", f"patient/{p.patient_code}", "SUCCESS", ip, description=desc)
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

    ep = p.current_episode
    if not ep:
        return {"error": "no current episode found for patient"}, 500

    # Check all required-for-discharge templates have completed forms for THIS episode
    required_templates = (
        FormTemplate.query
        .filter_by(tenant_id=g.tenant_id, required_for_discharge=True, status="active")
        .all()
    )
    missing = []
    for tmpl in required_templates:
        completed = PatientForm.query.filter(
            PatientForm.patient_id == p.id,
            PatientForm.template_id == tmpl.id,
            PatientForm.status == "completed",
            db.or_(PatientForm.episode_id == ep.id, PatientForm.episode_id.is_(None)),
        ).first()
        if not completed:
            missing.append(tmpl.name)
    if missing:
        return {"error": "Cannot discharge — required forms not completed", "missingForms": missing}, 409

    now = datetime.now(timezone.utc)

    # Update episode
    ep.discharged_at = now
    ep.discharge_reason = reason
    ep.status = "discharged"

    # Release bed from episode
    if ep.assigned_bed_id:
        bed = Bed.query.get(ep.assigned_bed_id)
        if bed:
            bed.status = "cleaning"
        ep.assigned_bed_id = None

    p.status = "inactive"

    db.session.commit()

    # Auto-create a Discharge Summary draft if the template exists and no open draft for this episode
    discharge_template = (
        FormTemplate.query
        .filter_by(tenant_id=g.tenant_id, name="Discharge Summary", status="active")
        .first()
    )
    if discharge_template:
        existing_draft = PatientForm.query.filter_by(
            patient_id=p.id, template_id=discharge_template.id, status="draft", episode_id=ep.id,
        ).first()
        if not existing_draft:
            db.session.add(PatientForm(
                tenant_id=g.tenant_id,
                patient_id=p.id,
                template_id=discharge_template.id,
                episode_id=ep.id,
                form_data={},
                status="draft",
            ))
            db.session.commit()

    reason_labels = {"completed": "Completed Treatment", "ama": "AMA", "transferred": "Transferred", "other": "Other"}
    log_access(g.user.id, "PATIENT_DISCHARGE", f"patient/{p.patient_code}", "SUCCESS", ip,
               description=f"Discharged {p.first_name} {p.last_name} ({p.patient_code}) — Episode #{ep.episode_number}, reason: {reason_labels.get(reason, reason)}")
    return _serialize_patient(p), 200


@patients_bp.post("/<patient_id>/readmit")
@require_auth(permission="frontdesk.patients.pending")
def readmit_patient(patient_id):
    """
    POST /api/patients/<id>/readmit
    Creates a new Episode and returns the patient to pending status.
    Only works on discharged (inactive) patients.
    """
    ip = client_ip()
    p = get_patient_by_id_or_code(patient_id)
    if not p:
        log_access(g.user.id, "PATIENT_READMIT", f"patient/{patient_id}", "FAILED", ip, description="Patient not found")
        return {"error": "patient not found"}, 404
    if not check_patient_access(p):
        return {"error": "forbidden"}, 403
    if p.status == "active":
        return {"error": "patient is currently admitted"}, 409
    if p.status == "pending":
        return {"error": "patient is already pending admission"}, 409

    p.readmission_count = (p.readmission_count or 0) + 1
    new_episode_number = p.readmission_count + 1

    # Create new episode
    ep = Episode(
        tenant_id=g.tenant_id,
        patient_id=p.id,
        episode_number=new_episode_number,
        status="pending",
        primary_diagnosis=p.primary_diagnosis,
    )
    db.session.add(ep)
    db.session.flush()

    # Point patient to new episode, return to pending
    p.current_episode_id = ep.id
    p.status = "pending"

    db.session.commit()

    log_access(g.user.id, "PATIENT_READMIT", f"patient/{p.patient_code}", "SUCCESS", ip,
               description=f"Readmitted {p.first_name} {p.last_name} ({p.patient_code}) — Episode #{ep.episode_number} created, returned to pending")
    return _serialize_patient(p), 200


# ─── EPISODES ───

def _serialize_episode(ep: Episode):
    return {
        "id": ep.id,
        "episodeNumber": ep.episode_number,
        "status": ep.status,
        "admittedAt": ep.admitted_at.isoformat() if ep.admitted_at else None,
        "dischargedAt": ep.discharged_at.isoformat() if ep.discharged_at else None,
        "dischargeReason": ep.discharge_reason,
        "primaryDiagnosis": ep.primary_diagnosis,
        "assignedBedId": ep.assigned_bed_id,
        "createdAt": ep.created_at.isoformat() if ep.created_at else None,
    }


@patients_bp.get("/<patient_id>/episodes")
@require_auth(permission="patients.view")
def list_episodes(patient_id):
    """GET /api/patients/<id>/episodes — all episodes for a patient, newest first."""
    ip = client_ip()
    p = get_patient_by_id_or_code(patient_id)
    if not p:
        return {"error": "patient not found"}, 404
    if not check_patient_access(p):
        return {"error": "forbidden"}, 403

    episodes = (
        Episode.query
        .filter_by(patient_id=p.id, tenant_id=g.tenant_id)
        .order_by(Episode.episode_number.desc())
        .all()
    )

    log_access(g.user.id, "EPISODE_LIST", f"patient/{p.patient_code}/episodes", "SUCCESS", ip,
               description=f"Viewed episode history for {p.first_name} {p.last_name} ({p.patient_code}) — {len(episodes)} episode(s)")
    return [_serialize_episode(ep) for ep in episodes], 200


@patients_bp.get("/<patient_id>/episodes/<int:episode_id>")
@require_auth(permission="patients.view")
def get_episode(patient_id, episode_id):
    """GET /api/patients/<id>/episodes/<episode_id> — single episode detail."""
    ip = client_ip()
    p = get_patient_by_id_or_code(patient_id)
    if not p:
        return {"error": "patient not found"}, 404
    if not check_patient_access(p):
        return {"error": "forbidden"}, 403

    ep = Episode.query.filter_by(id=episode_id, patient_id=p.id, tenant_id=g.tenant_id).first()
    if not ep:
        return {"error": "episode not found"}, 404

    log_access(g.user.id, "EPISODE_VIEW", f"patient/{p.patient_code}/episodes/{ep.id}", "SUCCESS", ip,
               description=f"Viewed Episode #{ep.episode_number} for {p.first_name} {p.last_name} ({p.patient_code})")
    return _serialize_episode(ep), 200


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
    discharged_from = (request.args.get("discharged_from") or "").strip()
    discharged_to = (request.args.get("discharged_to") or "").strip()

    if not q_str and not ssn and not discharged_from and not discharged_to:
        return {"error": "provide at least one search term (q, ssn, or date range)"}, 400

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

    if discharged_from or discharged_to:
        query = query.join(Episode, Patient.current_episode_id == Episode.id)
        if discharged_from:
            query = query.filter(Episode.discharged_at >= discharged_from)
        if discharged_to:
            query = query.filter(Episode.discharged_at <= discharged_to + " 23:59:59")

    results = query.order_by(Patient.last_name.asc(), Patient.first_name.asc()).all()
    return [_serialize_patient(p) for p in results], 200

