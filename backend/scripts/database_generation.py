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
from models import Tenant, User, Patient, AuditLog, FormTemplate, PatientForm
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

        # ── Users ──
        default_pw = "Password123!"

        # Tenant 1 staff
        t1_users = [
            User(
                tenant_id=tenant1.id,
                username="psychiatrist1",
                password_hash=generate_password_hash(default_pw),
                role="psychiatrist",
                full_name="Dr. Fierro",
                signature_data=_make_svg_signature("Dr. Fierro"),
            ),
            User(
                tenant_id=tenant1.id,
                username="technician1",
                password_hash=generate_password_hash(default_pw),
                role="technician",
                full_name="Jordan Kim",
                signature_data=_make_svg_signature("Jordan Kim"),
            ),
            User(
                tenant_id=tenant1.id,
                username="admin1",
                password_hash=generate_password_hash(default_pw),
                role="admin",
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
                role="psychiatrist",
                full_name="Dr. Santos",
                signature_data=_make_svg_signature("Dr. Santos"),
            ),
            User(
                tenant_id=tenant2.id,
                username="technician2",
                password_hash=generate_password_hash(default_pw),
                role="technician",
                full_name="Alex Rivera",
                signature_data=_make_svg_signature("Alex Rivera"),
            ),
            User(
                tenant_id=tenant2.id,
                username="admin2",
                password_hash=generate_password_hash(default_pw),
                role="admin",
                full_name="Casey Zhang",
                signature_data=_make_svg_signature("Casey Zhang"),
            ),
        ]

        db.session.add_all(t1_users + t2_users)
        db.session.commit()

        t1_tech = User.query.filter_by(username="technician1").first()
        t2_tech = User.query.filter_by(username="technician2").first()

        # ── Patients ──
        # Tenant 1: 10 patients
        t1_patients = []
        for i in range(1, 11):
            p = Patient(
                tenant_id=tenant1.id,
                patient_code=f"PT-{i:03d}",
                first_name=f"Test{i}",
                last_name="Patient",
                date_of_birth=date(1990, 1, min(i, 28)),
                phone=f"555-010{i:02d}",
                email=f"pt{i:03d}@example.com",
                status="active",
                risk_level="low" if i <= 6 else ("moderate" if i <= 8 else "high"),
                primary_diagnosis="General Anxiety" if i <= 5 else "Depression",
                insurance="Blue Shield" if i % 2 == 0 else "Kaiser",
                assigned_provider_id=t1_tech.id if t1_tech else None,
            )
            t1_patients.append(p)

        # Tenant 2: 5 patients (different clinic, different data)
        t2_patients = []
        for i in range(1, 6):
            p = Patient(
                tenant_id=tenant2.id,
                patient_code=f"PT-{i:03d}",
                first_name=f"Harbor{i}",
                last_name="Client",
                date_of_birth=date(1985, 6, min(i * 5, 28)),
                phone=f"555-020{i:02d}",
                email=f"harbor{i}@example.com",
                status="active",
                risk_level="moderate" if i <= 3 else "high",
                primary_diagnosis="Opioid Use Disorder" if i <= 3 else "Alcohol Use Disorder",
                insurance="Medi-Cal" if i % 2 == 0 else "Aetna",
                assigned_provider_id=t2_tech.id if t2_tech else None,
            )
            t2_patients.append(p)

        db.session.add_all(t1_patients + t2_patients)
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
        print("Form templates and sample forms created for both tenants.")


if __name__ == "__main__":
    seed()