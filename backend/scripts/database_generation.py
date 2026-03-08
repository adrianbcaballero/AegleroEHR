# creating data into database for testing purposes

import os
import sys
import base64
from datetime import date, datetime, timedelta, timezone

# Ensure imports work when running from /app/scripts
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from werkzeug.security import generate_password_hash
from app import create_app
from extensions import db
from models import Tenant, User, Patient, AuditLog, FormTemplate, PatientForm, Role, RolePermission, Bed, SYSTEM_ROLE_PERMISSIONS
import random


def _make_svg_signature(name: str) -> str:
    """Generate a cursive-style SVG signature as a base64 data URL."""
    # Escape special XML characters
    safe = name.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="440" height="120" viewBox="0 0 440 120">'
        f'<text x="20" y="85" '
        f'font-family="\'Brush Script MT\', \'Segoe Script\', \'Dancing Script\', cursive" '
        f'font-size="58" font-style="italic" fill="#1a1a2e">{safe}</text>'
        f'</svg>'
    )
    encoded = base64.b64encode(svg.encode()).decode()
    return f"data:image/svg+xml;base64,{encoded}"

app = create_app()


def seed():
    with app.app_context():
        # no duplicates
        if Tenant.query.first():
            print("Seed skipped: tenants already exist.")
            return

        # ── Tenants ──
        tenant1 = Tenant(
            name="Sunrise Detox Center",
            slug="sunrise-detox",
            status="active",
            npi="1982734560",
            phone="(512) 555-0190",
            email="admin@sunrisedetox.com",
            address="4801 S Congress Ave, Suite 200, Austin, TX 78745",
        )
        tenant2 = Tenant(
            name="Harbor Recovery Clinic",
            slug="harbor-recovery",
            status="active",
            npi="1374859203",
            phone="(713) 555-0247",
            email="admin@harborrecovery.com",
            address="9200 Westheimer Rd, Suite 410, Houston, TX 77063",
        )
        db.session.add_all([tenant1, tenant2])
        db.session.commit()

        print(f"Tenants created: '{tenant1.name}' (id={tenant1.id}), '{tenant2.name}' (id={tenant2.id})")

        # ── Roles ──
        def make_roles(tenant):
            roles = {}
            for role_name, perms in SYSTEM_ROLE_PERMISSIONS.items():
                display = {
                    "admin": "Administrator",
                    "psychiatrist": "Psychiatrist",
                    "technician": "Technician",
                    "auditor": "Auditor",
                }.get(role_name, role_name.title())
                r = Role(
                    tenant_id=tenant.id,
                    name=role_name,
                    display_name=display,
                    is_system_default=True,
                )
                db.session.add(r)
                db.session.flush()  # get r.id
                for perm in perms:
                    db.session.add(RolePermission(role_id=r.id, permission=perm))
                roles[role_name] = r
            return roles

        t1_roles = make_roles(tenant1)
        t2_roles = make_roles(tenant2)
        db.session.commit()

        # ── Users ──
        default_pw = "Password123!"

        # Tenant 1 staff
        t1_users = [
            User(
                tenant_id=tenant1.id,
                username="psychiatrist1",
                password_hash=generate_password_hash(default_pw),
                role_id=t1_roles["psychiatrist"].id,
                credentials=["MD", "ABPN"],
                full_name="Dr. Fierro",
                signature_data=_make_svg_signature("Dr. Fierro"),
            ),
            User(
                tenant_id=tenant1.id,
                username="technician1",
                password_hash=generate_password_hash(default_pw),
                role_id=t1_roles["technician"].id,
                credentials=["LCDC"],
                full_name="Jordan Kim",
                signature_data=_make_svg_signature("Jordan Kim"),
            ),
            User(
                tenant_id=tenant1.id,
                username="admin1",
                password_hash=generate_password_hash(default_pw),
                role_id=t1_roles["admin"].id,
                credentials=[],
                full_name="Morgan Lee",
                signature_data=_make_svg_signature("Morgan Lee"),
            ),
        ]

        # Tenant 2 staff
        t2_users = [
            User(
                tenant_id=tenant2.id,
                username="psychiatrist2",
                password_hash=generate_password_hash(default_pw),
                role_id=t2_roles["psychiatrist"].id,
                credentials=["MD", "FASAM"],
                full_name="Dr. Santos",
                signature_data=_make_svg_signature("Dr. Santos"),
            ),
            User(
                tenant_id=tenant2.id,
                username="technician2",
                password_hash=generate_password_hash(default_pw),
                role_id=t2_roles["technician"].id,
                credentials=["RN"],
                full_name="Alex Rivera",
                signature_data=_make_svg_signature("Alex Rivera"),
            ),
            User(
                tenant_id=tenant2.id,
                username="admin2",
                password_hash=generate_password_hash(default_pw),
                role_id=t2_roles["admin"].id,
                credentials=[],
                full_name="Casey Zhang",
                signature_data=_make_svg_signature("Casey Zhang"),
            ),
        ]

        db.session.add_all(t1_users + t2_users)
        db.session.commit()

        t1_tech = User.query.filter_by(username="technician1").first()
        t2_tech = User.query.filter_by(username="technician2").first()

        # ── Patients ──
        seed_now = datetime.now(timezone.utc)

        # Realistic patient data for a detox facility
        t1_patient_data = [
            # (first, last, dob_year, dob_month, dob_day, diagnosis, insurance, risk)
            ("Maria",   "Gonzalez",  1988,  3, 14, "F10.239 Alcohol use disorder, severe",    "Medicaid",      "high"),
            ("James",   "Carter",    1995,  7, 22, "F12.20 Cannabis use disorder, moderate",  "Blue Shield",   "moderate"),
            ("Emily",   "Tran",      1990, 11,  5, "F14.20 Cocaine use disorder, moderate",   "Aetna",         "high"),
            ("Robert",  "Kim",       1983,  2, 28, "F11.20 Opioid use disorder, severe",      "United Health", "high"),
            ("Sandra",  "Williams",  2000,  9,  3, "F13.20 Sedative use disorder, moderate",  "Cigna",         "moderate"),
            ("Carlos",  "Mendez",    1979,  5, 19, "F10.239 Alcohol use disorder, severe",    "Kaiser",        "high"),
            ("Ashley",  "Johnson",   1992,  8, 11, "F15.20 Stimulant use disorder, mild",     "Blue Shield",   "low"),
            ("Marcus",  "Davis",     1986, 12,  1, "F11.20 Opioid use disorder, severe",      "Medicaid",      "high"),
            ("Rachel",  "Lee",       1997,  4, 17, "F17.210 Nicotine dependence, cigarettes", "Aetna",         "low"),
            ("Thomas",  "Brown",     1974,  1, 30, "F10.239 Alcohol use disorder, severe",    "Kaiser",        "moderate"),
        ]

        t1_patients = []
        for i, (first, last, yr, mo, dy, diag, ins, risk) in enumerate(t1_patient_data, start=1):
            if i <= 2:
                pt_status = "pending"
                pt_admitted_at = None
                pt_discharged_at = None
                pt_discharge_reason = None
            elif i <= 8:
                pt_status = "active"
                pt_admitted_at = seed_now - timedelta(days=i)
                pt_discharged_at = None
                pt_discharge_reason = None
            else:
                pt_status = "inactive"
                pt_admitted_at = seed_now - timedelta(days=30)
                pt_discharged_at = seed_now - timedelta(days=i - 8)
                pt_discharge_reason = "completed" if i == 9 else "ama"

            p = Patient(
                tenant_id=tenant1.id,
                patient_code=f"PT-{i:03d}",
                first_name=first,
                last_name=last,
                date_of_birth=date(yr, mo, dy),
                phone=f"(512) 555-{i:04d}",
                email=f"{first.lower()}.{last.lower()}@example.com",
                status=pt_status,
                risk_level=risk,
                primary_diagnosis=diag,
                insurance=ins,
                assigned_provider_id=t1_tech.id if t1_tech else None,
                admitted_at=pt_admitted_at,
                discharged_at=pt_discharged_at,
                discharge_reason=pt_discharge_reason,
            )
            t1_patients.append(p)

        # Tenant 2: 5 patients
        t2_patients = []
        t2_data = [
            ("Luis",    "Reyes",    1990,  6, 10, "F11.20 Opioid use disorder, severe",    "Medi-Cal", "high"),
            ("Tanya",   "Nguyen",   1985,  3, 22, "F10.239 Alcohol use disorder, severe",  "Aetna",    "high"),
            ("Derek",   "Patel",    1993,  9,  5, "F14.20 Cocaine use disorder, moderate", "Medi-Cal", "moderate"),
            ("Monica",  "Torres",   1978, 12, 15, "F11.20 Opioid use disorder, severe",    "Aetna",    "high"),
            ("Kevin",   "Okafor",   2001,  1, 28, "F12.20 Cannabis use disorder, mild",    "Medi-Cal", "low"),
        ]
        for i, (first, last, yr, mo, dy, diag, ins, risk) in enumerate(t2_data, start=1):
            p = Patient(
                tenant_id=tenant2.id,
                patient_code=f"PT-{i:03d}",
                first_name=first,
                last_name=last,
                date_of_birth=date(yr, mo, dy),
                phone=f"(713) 555-{i:04d}",
                email=f"{first.lower()}.{last.lower()}@harbor.example.com",
                status="active",
                risk_level=risk,
                primary_diagnosis=diag,
                insurance=ins,
                assigned_provider_id=t2_tech.id if t2_tech else None,
                admitted_at=seed_now - timedelta(days=i + 1),
            )
            t2_patients.append(p)

        db.session.add_all(t1_patients + t2_patients)
        db.session.commit()

        # ── Beds (Tenant 1 — Sunrise Detox) ──
        t1_bed_data = [
            # (display_name, unit, room, bed_label, sort_order, status)
            ("Bed A-1", "Detox Unit A", "101", "1", 1, "available"),
            ("Bed A-2", "Detox Unit A", "102", "2", 2, "available"),
            ("Bed A-3", "Detox Unit A", "103", "3", 3, "available"),
            ("Bed A-4", "Detox Unit A", "104", "4", 4, "available"),
            ("Bed B-1", "Detox Unit B", "201", "1", 1, "available"),
            ("Bed B-2", "Detox Unit B", "202", "2", 2, "available"),
            ("Bed B-3", "Detox Unit B", "203", "3", 3, "cleaning"),
            ("Bed B-4", "Detox Unit B", "204", "4", 4, "out_of_service"),
        ]
        t1_beds = []
        for display_name, unit, room, label, sort_order, status in t1_bed_data:
            b = Bed(
                tenant_id=tenant1.id,
                display_name=display_name,
                unit=unit,
                room=room,
                bed_label=label,
                sort_order=sort_order,
                status=status,
                is_active=True,
            )
            db.session.add(b)
            t1_beds.append(b)

        db.session.flush()  # get bed IDs before assigning

        # Assign active patients (PT-003 through PT-008) to the first 6 beds
        active_t1 = [p for p in t1_patients if p.status == "active"]
        available_beds = [b for b in t1_beds if b.status == "available"]
        for patient, bed in zip(active_t1, available_beds):
            patient.assigned_bed_id = bed.id
            bed.status = "available"  # occupied is derived from patient FK

        db.session.commit()

        # ── Audit Logs ──
        logs = [
            AuditLog(
                tenant_id=tenant1.id,
                user_id=t1_tech.id if t1_tech else None,
                action="SEED",
                resource="database",
                ip_address="127.0.0.1",
                status="SUCCESS",
                timestamp=datetime.now(timezone.utc) - timedelta(days=1),
            ),
            AuditLog(
                tenant_id=tenant2.id,
                user_id=t2_tech.id if t2_tech else None,
                action="SEED",
                resource="database",
                ip_address="127.0.0.1",
                status="SUCCESS",
                timestamp=datetime.now(timezone.utc) - timedelta(days=1),
            ),
        ]
        db.session.add_all(logs)
        db.session.commit()

        now = datetime.now(timezone.utc)

        # ── Form Templates (one set per tenant) ──
        for tenant, creator in [(tenant1, t1_users[2]), (tenant2, t2_users[2])]:
            templates = [
                FormTemplate(
                    tenant_id=tenant.id,
                    name="New Patient Intake Form",
                    category="intake",
                    description="Standard intake form for new patients including demographics, medical history, insurance information, and emergency contacts.",
                    fields=[
                        {"label": "Full Name", "type": "text"},
                        {"label": "Date of Birth", "type": "date"},
                        {"label": "Primary Insurance", "type": "text"},
                        {"label": "Emergency Contact", "type": "text"},
                        {"label": "Reason for Visit", "type": "textarea"},
                        {"label": "Medical History", "type": "textarea"},
                        {"label": "Current Medications", "type": "textarea"},
                        {"label": "Consent Acknowledgment", "type": "checkbox", "options": ["Yes", "No"]},
                    ],
                    allowed_roles=["admin", "psychiatrist", "technician"],
                    created_by=creator.id,
                ),
                FormTemplate(
                    tenant_id=tenant.id,
                    name="PHQ-9 Depression Screening",
                    category="assessment",
                    description="Patient Health Questionnaire-9 for screening, diagnosing, monitoring, and measuring severity of depression.",
                    fields=[
                        {"label": "Little interest or pleasure", "type": "scale", "min": 0, "max": 3},
                        {"label": "Feeling down or depressed", "type": "scale", "min": 0, "max": 3},
                        {"label": "Trouble falling/staying asleep", "type": "scale", "min": 0, "max": 3},
                        {"label": "Feeling tired or little energy", "type": "scale", "min": 0, "max": 3},
                        {"label": "Poor appetite or overeating", "type": "scale", "min": 0, "max": 3},
                        {"label": "Feeling bad about yourself", "type": "scale", "min": 0, "max": 3},
                        {"label": "Trouble concentrating", "type": "scale", "min": 0, "max": 3},
                        {"label": "Moving or speaking slowly", "type": "scale", "min": 0, "max": 3},
                        {"label": "Thoughts of self-harm", "type": "scale", "min": 0, "max": 3},
                    ],
                    allowed_roles=["admin", "psychiatrist"],
                    created_by=creator.id,
                ),
                FormTemplate(
                    tenant_id=tenant.id,
                    name="GAD-7 Anxiety Assessment",
                    category="assessment",
                    description="Generalized Anxiety Disorder 7-item scale for screening and measuring severity of generalized anxiety disorder.",
                    fields=[
                        {"label": "Feeling nervous or on edge", "type": "scale", "min": 0, "max": 3},
                        {"label": "Not being able to stop worrying", "type": "scale", "min": 0, "max": 3},
                        {"label": "Worrying too much", "type": "scale", "min": 0, "max": 3},
                        {"label": "Trouble relaxing", "type": "scale", "min": 0, "max": 3},
                        {"label": "Being so restless", "type": "scale", "min": 0, "max": 3},
                        {"label": "Becoming easily annoyed", "type": "scale", "min": 0, "max": 3},
                        {"label": "Feeling afraid", "type": "scale", "min": 0, "max": 3},
                    ],
                    allowed_roles=["admin", "psychiatrist"],
                    created_by=creator.id,
                ),
                FormTemplate(
                    tenant_id=tenant.id,
                    name="Informed Consent for Treatment",
                    category="consent",
                    description="Standard informed consent document covering treatment procedures, risks, benefits, confidentiality, and patient rights.",
                    fields=[
                        {"label": "Patient Name", "type": "text"},
                        {"label": "Treatment Type", "type": "select", "options": ["Individual Therapy", "Group Therapy", "Medication Management", "Crisis Intervention"]},
                        {"label": "Risks Acknowledgment", "type": "checkbox", "options": ["Yes", "No"]},
                        {"label": "Benefits Acknowledgment", "type": "checkbox", "options": ["Yes", "No"]},
                        {"label": "Confidentiality Agreement", "type": "checkbox", "options": ["Yes", "No"]},
                        {"label": "Patient Signature", "type": "signature"},
                        {"label": "Date", "type": "date"},
                    ],
                    allowed_roles=["admin", "psychiatrist", "technician"],
                    created_by=creator.id,
                ),
                FormTemplate(
                    tenant_id=tenant.id,
                    name="Insurance Authorization Form",
                    category="insurance",
                    description="Form for requesting prior authorization from insurance carriers for continued treatment sessions.",
                    fields=[
                        {"label": "Patient Name", "type": "text"},
                        {"label": "Insurance ID", "type": "text"},
                        {"label": "Diagnosis Code", "type": "text"},
                        {"label": "Requested Sessions", "type": "number"},
                        {"label": "Clinical Justification", "type": "textarea"},
                        {"label": "Provider Signature", "type": "signature"},
                    ],
                    allowed_roles=["admin", "psychiatrist"],
                    created_by=creator.id,
                ),
                FormTemplate(
                    tenant_id=tenant.id,
                    name="Safety Plan Worksheet",
                    category="clinical",
                    description="Collaborative safety planning tool for patients at risk, including warning signs, coping strategies, and emergency contacts.",
                    fields=[
                        {"label": "Warning Signs", "type": "textarea"},
                        {"label": "Internal Coping Strategies", "type": "textarea"},
                        {"label": "People Who Provide Distraction", "type": "textarea"},
                        {"label": "People to Ask for Help", "type": "textarea"},
                        {"label": "Professionals to Contact", "type": "textarea"},
                        {"label": "Making Environment Safe", "type": "textarea"},
                        {"label": "Patient Signature", "type": "signature"},
                    ],
                    allowed_roles=["admin", "psychiatrist"],
                    created_by=creator.id,
                ),
                FormTemplate(
                    tenant_id=tenant.id,
                    name="Symptom Checklist",
                    category="assessment",
                    description="General symptom screening with check-all-that-apply format for initial assessment.",
                    fields=[
                        {"label": "Current Symptoms", "type": "checkbox_group", "options": ["Anxiety", "Depression", "Insomnia", "Fatigue", "Loss of Appetite", "Irritability", "Difficulty Concentrating", "Panic Attacks"]},
                        {"label": "Symptom Duration", "type": "select", "options": ["Less than 2 weeks", "2-4 weeks", "1-3 months", "3-6 months", "More than 6 months"]},
                        {"label": "Severity", "type": "select", "options": ["Mild", "Moderate", "Severe"]},
                        {"label": "Previous Treatment", "type": "checkbox", "options": ["Yes", "No"]},
                        {"label": "Additional Notes", "type": "textarea"},
                    ],
                    allowed_roles=["admin", "psychiatrist", "technician"],
                    created_by=creator.id,
                ),
                # ── Progress Notes ──
                FormTemplate(
                    tenant_id=tenant.id,
                    name="Detox Progress Note",
                    category="progress-notes",
                    description="SOAP-format clinical progress note. Written each shift by the treating clinician to document the patient's current status, withdrawal progression, and any changes to the treatment plan.",
                    fields=[
                        {"label": "Shift", "type": "select", "options": ["Day (7am–3pm)", "Evening (3pm–11pm)", "Night (11pm–7am)"]},
                        {"label": "Subjective — Patient's own report (symptoms, mood, complaints, sleep, appetite)", "type": "textarea"},
                        {"label": "Objective — Clinician observations (behavior, appearance, affect, CIWA/COWS score this shift)", "type": "textarea"},
                        {"label": "Assessment — Clinical impression and withdrawal stage", "type": "textarea"},
                        {"label": "Plan — Medication changes, interventions, follow-up, LOC considerations", "type": "textarea"},
                        {"label": "Clinician Signature", "type": "signature"},
                    ],
                    allowed_roles=["admin", "psychiatrist", "technician"],
                    created_by=creator.id,
                ),
                # ── Detox Flowsheets ──
                FormTemplate(
                    tenant_id=tenant.id,
                    name="CIWA-Ar",
                    category="flowsheet",
                    description="Clinical Institute Withdrawal Assessment for Alcohol, Revised. Scored 0–67. "
                                "Mild: 0–9 | Moderate: 10–20 | Severe: 21+. Administer every 4–8 hours during active detox.",
                    fields=[
                        {"label": "Nausea / Vomiting (0=none, 7=constant nausea + vomiting)", "type": "scale", "min": 0, "max": 7},
                        {"label": "Tremor — arms extended, fingers spread (0=none, 7=severe, even at rest)", "type": "scale", "min": 0, "max": 7},
                        {"label": "Paroxysmal Sweats (0=no sweat, 7=drenching sweats)", "type": "scale", "min": 0, "max": 7},
                        {"label": "Anxiety (0=no anxiety, 7=equivalent to acute panic state)", "type": "scale", "min": 0, "max": 7},
                        {"label": "Agitation (0=normal activity, 7=pacing constantly or thrashing)", "type": "scale", "min": 0, "max": 7},
                        {"label": "Tactile Disturbances (0=none, 7=continuous hallucinations)", "type": "scale", "min": 0, "max": 7},
                        {"label": "Auditory Disturbances (0=none, 7=continuous hallucinations)", "type": "scale", "min": 0, "max": 7},
                        {"label": "Visual Disturbances (0=none, 7=continuous hallucinations)", "type": "scale", "min": 0, "max": 7},
                        {"label": "Headache / Fullness in Head (0=none, 7=extremely severe)", "type": "scale", "min": 0, "max": 7},
                        {"label": "Orientation / Clouding of Sensorium (0=oriented, 4=oriented to person only)", "type": "scale", "min": 0, "max": 4},
                        {"label": "Pulse Rate (BPM)", "type": "number"},
                        {"label": "Blood Pressure", "type": "text"},
                        {"label": "Temperature (°F)", "type": "number"},
                        {"label": "Respiratory Rate", "type": "number"},
                        {"label": "Clinician Notes", "type": "textarea"},
                    ],
                    allowed_roles=["admin", "psychiatrist", "technician"],
                    created_by=creator.id,
                ),
                FormTemplate(
                    tenant_id=tenant.id,
                    name="COWS",
                    category="flowsheet",
                    description="Clinical Opiate Withdrawal Scale. Scored 0–48. "
                                "Mild: 5–12 | Moderate: 13–24 | Moderately Severe: 25–36 | Severe: 37+. "
                                "Administer every 4–8 hours during opioid detox.",
                    fields=[
                        {"label": "Resting Pulse Rate (0=≤80, 1=81–100, 2=101–120, 4=>120)", "type": "scale", "min": 0, "max": 4},
                        {"label": "Sweating (0=none, 1=barely perceptible, 2=beads on brow, 3=streams, 4=drenching)", "type": "scale", "min": 0, "max": 4},
                        {"label": "Restlessness (0=able to sit still, 1=hard time sitting still, 3=frequent shifting, 5=unable to sit)", "type": "scale", "min": 0, "max": 5},
                        {"label": "Pupil Size (0=normal/pinpoint, 1=possibly larger, 2=moderately dilated, 5=max dilation)", "type": "scale", "min": 0, "max": 5},
                        {"label": "Bone or Joint Aches (0=none, 1=mild diffuse, 2=patient reports severe, 4=patient rubbing joints)", "type": "scale", "min": 0, "max": 4},
                        {"label": "Runny Nose or Tearing (0=none, 1=nasal stuffiness, 2=runny nose, 4=tears streaming)", "type": "scale", "min": 0, "max": 4},
                        {"label": "GI Upset (0=none, 1=stomach cramps, 2=nausea/loose stool, 3=vomiting/diarrhea, 5=multiple episodes)", "type": "scale", "min": 0, "max": 5},
                        {"label": "Tremor (0=none, 1=can feel, 2=can observe, 4=gross tremor)", "type": "scale", "min": 0, "max": 4},
                        {"label": "Yawning (0=none, 1=once/twice, 2=three or more times, 4=several times/min)", "type": "scale", "min": 0, "max": 4},
                        {"label": "Anxiety or Irritability (0=none, 1=patient reports, 2=patient obviously irritable, 4=patient so irritable)", "type": "scale", "min": 0, "max": 4},
                        {"label": "Gooseflesh Skin (0=smooth, 3=piloerection can be felt, 5=prominent piloerection)", "type": "scale", "min": 0, "max": 5},
                        {"label": "Clinician Notes", "type": "textarea"},
                    ],
                    allowed_roles=["admin", "psychiatrist", "technician"],
                    created_by=creator.id,
                ),
                FormTemplate(
                    tenant_id=tenant.id,
                    name="Treatment Plan",
                    category="treatment",
                    description="Individualized treatment plan documenting patient goals, target dates, assigned provider, and review schedule for the episode of care.",
                    fields=[
                        {"label": "Primary Substance(s)", "type": "text"},
                        {"label": "Start Date", "type": "date"},
                        {"label": "Anticipated Discharge Date", "type": "date"},
                        {"label": "Review Date", "type": "date"},
                        {"label": "Problem / Presenting Issue", "type": "textarea"},
                        {"label": "Goal 1", "type": "text"},
                        {"label": "Goal 1 Target Date", "type": "date"},
                        {"label": "Goal 1 Status", "type": "select", "options": ["In Progress", "Partially Met", "Met", "Not Met"]},
                        {"label": "Goal 2", "type": "text"},
                        {"label": "Goal 2 Target Date", "type": "date"},
                        {"label": "Goal 2 Status", "type": "select", "options": ["In Progress", "Partially Met", "Met", "Not Met"]},
                        {"label": "Goal 3", "type": "text"},
                        {"label": "Goal 3 Target Date", "type": "date"},
                        {"label": "Goal 3 Status", "type": "select", "options": ["In Progress", "Partially Met", "Met", "Not Met"]},
                        {"label": "Aftercare / Continuing Care Plan", "type": "textarea"},
                        {"label": "Patient Agrees to Plan", "type": "checkbox", "options": ["Yes", "No"]},
                        {"label": "Patient Signature", "type": "signature"},
                        {"label": "Clinician Signature", "type": "signature"},
                    ],
                    allowed_roles=["admin", "psychiatrist", "technician"],
                    created_by=creator.id,
                ),
                # ── Recurring: Nursing Vitals ──
                FormTemplate(
                    tenant_id=tenant.id,
                    name="Nursing Vitals",
                    category="flowsheet",
                    description="Routine vital signs flowsheet. Auto-generated every 8 hours for active detox patients.",
                    fields=[
                        {"label": "Blood Pressure (mmHg)", "type": "text"},
                        {"label": "Heart Rate (BPM)", "type": "number"},
                        {"label": "Respiratory Rate (breaths/min)", "type": "number"},
                        {"label": "Temperature (°F)", "type": "number"},
                        {"label": "Oxygen Saturation (%)", "type": "number"},
                        {"label": "Pain Level (0–10)", "type": "scale", "min": 0, "max": 10},
                        {"label": "Level of Consciousness", "type": "select", "options": ["Alert", "Verbal", "Pain", "Unresponsive"]},
                        {"label": "Notes", "type": "textarea"},
                    ],
                    allowed_roles=["admin", "psychiatrist", "technician"],
                    is_recurring=True,
                    recurrence_value=8,
                    recurrence_unit="hours",
                    created_by=creator.id,
                ),
                # ── ASAM Level of Care Assessment ──
                FormTemplate(
                    tenant_id=tenant.id,
                    name="ASAM Level of Care Assessment",
                    category="assessment",
                    description="ASAM Patient Placement Criteria (3rd Ed.) — scores 6 dimensions 0–4 to determine recommended Level of Care (LOC). "
                                "Completing this form automatically updates the patient's current LOC.",
                    fields=[
                        {"label": "D1: Acute Intoxication / Withdrawal Risk", "type": "scale", "min": 0, "max": 4},
                        {"label": "D2: Biomedical Conditions", "type": "scale", "min": 0, "max": 4},
                        {"label": "D3: Emotional / Behavioral / Cognitive", "type": "scale", "min": 0, "max": 4},
                        {"label": "D4: Readiness to Change", "type": "scale", "min": 0, "max": 4},
                        {"label": "D5: Relapse / Continued Use Risk", "type": "scale", "min": 0, "max": 4},
                        {"label": "D6: Recovery / Living Environment", "type": "scale", "min": 0, "max": 4},
                        {"label": "Primary Substance", "type": "select", "options": ["Alcohol", "Opioids", "Stimulants", "Cannabis", "Benzodiazepines", "Multiple Substances", "Other"]},
                        {"label": "LOC Override", "type": "select", "options": ["No override", "1.0 - Outpatient", "2.1 - IOP", "2.5 - PHP", "3.1 - Low-Intensity Residential", "3.5 - RTC", "3.7 - Medically Monitored Inpatient", "4.0 - Medically Managed Inpatient"], "optional": True, "note": "Leave as 'No override' to let the system calculate LOC automatically from D1–D6 scores."},
                        {"label": "Clinical Notes", "type": "textarea"},
                    ],
                    allowed_roles=["admin", "psychiatrist"],
                    created_by=creator.id,
                ),
                # ── Discharge Summary ──
                FormTemplate(
                    tenant_id=tenant.id,
                    name="Discharge Summary",
                    category="discharge",
                    description="Clinical summary completed at time of discharge. Captures treatment course, reason for discharge, aftercare plan, and clinician attestation.",
                    fields=[
                        {"label": "Discharge Date", "type": "date"},
                        {"label": "Discharge Reason", "type": "select", "options": ["Completed Program", "Against Medical Advice (AMA)", "Transferred", "Other"]},
                        {"label": "Admission Date", "type": "date"},
                        {"label": "Primary Diagnosis", "type": "text"},
                        {"label": "Secondary Diagnoses", "type": "textarea", "optional": True},
                        {"label": "Treatment Summary", "type": "textarea"},
                        {"label": "Medications at Discharge", "type": "textarea"},
                        {"label": "Aftercare Plan", "type": "textarea"},
                        {"label": "Follow-Up Appointments", "type": "textarea", "optional": True},
                        {"label": "Patient Condition at Discharge", "type": "select", "options": ["Stable", "Improved", "Unchanged", "Deteriorated"]},
                        {"label": "Clinician Notes", "type": "textarea", "optional": True},
                        {"label": "Clinician Signature", "type": "signature"},
                    ],
                    allowed_roles=["admin", "psychiatrist"],
                    created_by=creator.id,
                ),
            ]
            db.session.add_all(templates)

        db.session.commit()

        # ── Sample Patient Forms ──
        # Tenant 1 forms
        t1_intake = FormTemplate.query.filter_by(tenant_id=tenant1.id, name="New Patient Intake Form").first()
        t1_symptom = FormTemplate.query.filter_by(tenant_id=tenant1.id, name="Symptom Checklist").first()

        t1_tech_name = t1_tech.full_name or t1_tech.username
        t2_tech_name = t2_tech.full_name or t2_tech.username

        def completed_form(tenant_id, patient_id, template_id, form_data, filled_by, signed_by_name, days_ago=3):
            signed_at = now - timedelta(days=days_ago, hours=random.randint(0, 8))
            return PatientForm(
                tenant_id=tenant_id,
                patient_id=patient_id,
                template_id=template_id,
                form_data=form_data,
                status="completed",
                filled_by=filled_by,
                signed_by_name=signed_by_name,
                signed_at=signed_at,
                signature_image=_make_svg_signature(signed_by_name),
            )

        if t1_intake:
            for i, p in enumerate(t1_patients[:5]):
                db.session.add(completed_form(
                    tenant_id=tenant1.id,
                    patient_id=p.id,
                    template_id=t1_intake.id,
                    form_data={
                        "Full Name": f"{p.first_name} {p.last_name}",
                        "Date of Birth": p.date_of_birth.isoformat() if p.date_of_birth else "",
                        "Primary Insurance": p.insurance or "",
                        "Emergency Contact": "John Doe - 555-0000",
                        "Reason for Visit": p.primary_diagnosis or "Initial assessment",
                        "Medical History": "No significant history",
                        "Current Medications": "None",
                        "Consent Acknowledgment": "Yes",
                    },
                    filled_by=t1_tech.id,
                    signed_by_name=t1_tech_name,
                    days_ago=i + 1,
                ))

        if t1_symptom:
            for p in t1_patients[3:7]:
                f = PatientForm(
                    tenant_id=tenant1.id,
                    patient_id=p.id,
                    template_id=t1_symptom.id,
                    form_data={
                        "Current Symptoms": ["Anxiety", "Insomnia", "Fatigue"],
                        "Symptom Duration": "2-4 weeks",
                        "Severity": "Moderate",
                        "Previous Treatment": "No",
                        "Additional Notes": f"Patient reports ongoing symptoms for {p.patient_code}.",
                    },
                    status="draft",
                    filled_by=t1_tech.id,
                )
                db.session.add(f)

        # Tenant 2 forms
        t2_intake = FormTemplate.query.filter_by(tenant_id=tenant2.id, name="New Patient Intake Form").first()

        if t2_intake:
            for i, p in enumerate(t2_patients[:3]):
                db.session.add(completed_form(
                    tenant_id=tenant2.id,
                    patient_id=p.id,
                    template_id=t2_intake.id,
                    form_data={
                        "Full Name": f"{p.first_name} {p.last_name}",
                        "Date of Birth": p.date_of_birth.isoformat() if p.date_of_birth else "",
                        "Primary Insurance": p.insurance or "",
                        "Emergency Contact": "Jane Smith - 555-9999",
                        "Reason for Visit": p.primary_diagnosis or "Detox intake",
                        "Medical History": "See chart",
                        "Current Medications": "Suboxone",
                        "Consent Acknowledgment": "Yes",
                    },
                    filled_by=t2_tech.id,
                    signed_by_name=t2_tech_name,
                    days_ago=i + 1,
                ))

        db.session.commit()

        # ── Sample CIWA-Ar Flowsheet Entries ──
        t1_ciwa = FormTemplate.query.filter_by(tenant_id=tenant1.id, name="CIWA-Ar").first()
        t2_ciwa = FormTemplate.query.filter_by(tenant_id=tenant2.id, name="CIWA-Ar").first()

        def ciwa_data(nausea, tremor, sweats, anxiety, agitation, tactile, auditory, visual, headache, orientation, pulse, bp, temp, rr, notes):
            return {
                "Nausea / Vomiting (0=none, 7=constant nausea + vomiting)": nausea,
                "Tremor — arms extended, fingers spread (0=none, 7=severe, even at rest)": tremor,
                "Paroxysmal Sweats (0=no sweat, 7=drenching sweats)": sweats,
                "Anxiety (0=no anxiety, 7=equivalent to acute panic state)": anxiety,
                "Agitation (0=normal activity, 7=pacing constantly or thrashing)": agitation,
                "Tactile Disturbances (0=none, 7=continuous hallucinations)": tactile,
                "Auditory Disturbances (0=none, 7=continuous hallucinations)": auditory,
                "Visual Disturbances (0=none, 7=continuous hallucinations)": visual,
                "Headache / Fullness in Head (0=none, 7=extremely severe)": headache,
                "Orientation / Clouding of Sensorium (0=oriented, 4=oriented to person only)": orientation,
                "Pulse Rate (BPM)": pulse,
                "Blood Pressure": bp,
                "Temperature (°F)": temp,
                "Respiratory Rate": rr,
                "Clinician Notes": notes,
            }

        if t1_ciwa:
            db.session.add(completed_form(
                tenant_id=tenant1.id, patient_id=t1_patients[0].id, template_id=t1_ciwa.id,
                form_data=ciwa_data(1,1,1,1,1,1,0,0,1,0, 82,"118/76",98.4,16,"Patient resting comfortably."),
                filled_by=t1_tech.id, signed_by_name=t1_tech_name, days_ago=3,
            ))
            db.session.add(completed_form(
                tenant_id=tenant1.id, patient_id=t1_patients[1].id, template_id=t1_ciwa.id,
                form_data=ciwa_data(3,2,2,3,2,1,1,1,1,0, 98,"130/84",99.1,18,"Monitor closely, consider PRN lorazepam."),
                filled_by=t1_tech.id, signed_by_name=t1_tech_name, days_ago=2,
            ))
            db.session.add(completed_form(
                tenant_id=tenant1.id, patient_id=t1_patients[2].id, template_id=t1_ciwa.id,
                form_data=ciwa_data(5,4,4,4,4,2,2,2,2,1, 114,"148/96",100.2,22,"Escalating. Notified physician. Lorazepam administered."),
                filled_by=t1_tech.id, signed_by_name=t1_tech_name, days_ago=1,
            ))

        if t2_ciwa:
            db.session.add(completed_form(
                tenant_id=tenant2.id, patient_id=t2_patients[0].id, template_id=t2_ciwa.id,
                form_data=ciwa_data(2,2,2,2,1,1,1,1,2,0, 92,"126/80",98.8,17,"Stable but monitoring."),
                filled_by=t2_tech.id, signed_by_name=t2_tech_name, days_ago=2,
            ))

        db.session.commit()

        print()
        print("Seed complete!")
        print()
        print("Tenants:")
        print(f"  1. {tenant1.name} (slug: {tenant1.slug})")
        print(f"  2. {tenant2.name} (slug: {tenant2.slug})")
        print()
        print("Login credentials (Password for all: Password123!):")
        print(f"  Sunrise:  admin1 / psychiatrist1 / technician1")
        print(f"  Harbor:   admin2 / psychiatrist2 / technician2")
        print()
        print(f"Patients: {len(t1_patients)} (Sunrise) + {len(t2_patients)} (Harbor)")
        print(f"  Sunrise — 2 pending, 6 active, 2 discharged")
        print(f"  Harbor  — 5 active")
        print()
        occupied = sum(1 for b in t1_beds if any(p.assigned_bed_id == b.id for p in t1_patients))
        print(f"Beds (Sunrise): {len(t1_beds)} total — {occupied} occupied, 1 cleaning, 1 out of service")
        print("Form templates and sample forms created for both tenants.")


if __name__ == "__main__":
    seed()