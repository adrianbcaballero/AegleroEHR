# creating data into database for testing purposes

import os
import sys
from datetime import date, datetime, timedelta, timezone

# Ensure imports work when running from /app/scripts
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from werkzeug.security import generate_password_hash
from app import create_app
from extensions import db
from models import Tenant, User, Patient, AuditLog, TreatmentPlan, FormTemplate, PatientForm
import random

app = create_app()


def seed():
    with app.app_context():
        # no duplicates
        if Tenant.query.first():
            print("Seed skipped: tenants already exist.")
            return

        # ── Tenants ──
        tenant1 = Tenant(name="Sunrise Detox Center", slug="sunrise-detox", status="active")
        tenant2 = Tenant(name="Harbor Recovery Clinic", slug="harbor-recovery", status="active")
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
            ),
            User(
                tenant_id=tenant1.id,
                username="technician1",
                password_hash=generate_password_hash(default_pw),
                role="technician",
                full_name="Jordan Kim",
            ),
            User(
                tenant_id=tenant1.id,
                username="admin1",
                password_hash=generate_password_hash(default_pw),
                role="admin",
                full_name="Morgan Lee",
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
            ),
            User(
                tenant_id=tenant2.id,
                username="technician2",
                password_hash=generate_password_hash(default_pw),
                role="technician",
                full_name="Alex Rivera",
            ),
            User(
                tenant_id=tenant2.id,
                username="admin2",
                password_hash=generate_password_hash(default_pw),
                role="admin",
                full_name="Casey Zhang",
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

        # ── Treatment Plans ──
        now = datetime.now(timezone.utc)

        for p in t1_patients:
            if random.random() < 0.7:
                start = now.date() - timedelta(days=random.randint(0, 60))
                review = start + timedelta(days=30)
                tp = TreatmentPlan(
                    tenant_id=tenant1.id,
                    patient_id=p.id,
                    start_date=start,
                    review_date=review,
                    goals=[
                        {"goal": "Reduce symptoms", "target": "4 weeks"},
                        {"goal": "Improve daily routine", "target": "2 weeks"},
                    ],
                    status="active",
                    updated_at=now,
                )
                db.session.add(tp)

        for p in t2_patients:
            if random.random() < 0.7:
                start = now.date() - timedelta(days=random.randint(0, 30))
                review = start + timedelta(days=14)
                tp = TreatmentPlan(
                    tenant_id=tenant2.id,
                    patient_id=p.id,
                    start_date=start,
                    review_date=review,
                    goals=[
                        {"goal": "Complete detox protocol", "target": "2 weeks"},
                        {"goal": "Establish sobriety support plan", "target": "3 weeks"},
                    ],
                    status="active",
                    updated_at=now,
                )
                db.session.add(tp)

        db.session.commit()

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
            ]
            db.session.add_all(templates)

        db.session.commit()

        # ── Sample Patient Forms ──
        # Tenant 1 forms
        t1_intake = FormTemplate.query.filter_by(tenant_id=tenant1.id, name="New Patient Intake Form").first()
        t1_symptom = FormTemplate.query.filter_by(tenant_id=tenant1.id, name="Symptom Checklist").first()

        if t1_intake:
            for p in t1_patients[:5]:
                f = PatientForm(
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
                    status="completed",
                    filled_by=t1_tech.id,
                )
                db.session.add(f)

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
            for p in t2_patients[:3]:
                f = PatientForm(
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
                    status="completed",
                    filled_by=t2_tech.id,
                )
                db.session.add(f)

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
        print("Treatment plans, form templates, and sample forms created for both tenants.")


if __name__ == "__main__":
    seed()