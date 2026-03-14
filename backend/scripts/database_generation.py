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
from models import (
    Tenant, User, Patient, AuditLog, FormTemplate, PatientForm,
    Role, RolePermission, Bed, CareTeam, CareTeamMember,
    SYSTEM_ROLE_PERMISSIONS,
)
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
            name="Aeglero Detox Center",
            slug="aeglero-detox",
            status="active",
            npi="1982734560",
            phone="(999) 999-9999",
            email="contact@aeglero.com",
            address="1111 Congress Ave, Suite 1111, Austin, TX 11111",
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

        # ── Custom Roles ──
        # Front Desk Coordinator — can register patients, manage admissions, beds
        t1_frontdesk_role = Role(
            tenant_id=tenant1.id,
            name="front_desk",
            display_name="Front Desk Coordinator",
            is_system_default=False,
        )
        db.session.add(t1_frontdesk_role)
        db.session.flush()
        for perm in [
            "patients.view", "patients.edit",
            "frontdesk.view", "frontdesk.patients.create",
            "frontdesk.patients.pending", "frontdesk.beds.manage",
            "consent.manage",
        ]:
            db.session.add(RolePermission(role_id=t1_frontdesk_role.id, permission=perm))

        # Nurse — clinical access, vitals, front desk view, consent
        t1_nurse_role = Role(
            tenant_id=tenant1.id,
            name="nurse",
            display_name="Registered Nurse",
            is_system_default=False,
        )
        db.session.add(t1_nurse_role)
        db.session.flush()
        for perm in [
            "patients.view", "patients.edit",
            "frontdesk.view", "frontdesk.patients.pending",
            "archive.view",
            "consent.manage",
        ]:
            db.session.add(RolePermission(role_id=t1_nurse_role.id, permission=perm))

        db.session.commit()

        # ── Users ──
        default_pw = "Password123!"

        # Tenant 1 staff — realistic small detox clinic
        t1_admin = User(
            tenant_id=tenant1.id,
            username="admin1",
            password_hash=generate_password_hash(default_pw),
            role_id=t1_roles["admin"].id,
            credentials=[],
            full_name="Morgan Lee",
            signature_data=_make_svg_signature("Morgan Lee"),
        )
        t1_psych = User(
            tenant_id=tenant1.id,
            username="psychiatrist1",
            password_hash=generate_password_hash(default_pw),
            role_id=t1_roles["psychiatrist"].id,
            credentials=["MD", "ABPN"],
            full_name="Dr. Fierro",
            signature_data=_make_svg_signature("Dr. Fierro"),
        )
        t1_psych2 = User(
            tenant_id=tenant1.id,
            username="psychiatrist3",
            password_hash=generate_password_hash(default_pw),
            role_id=t1_roles["psychiatrist"].id,
            credentials=["MD", "FASAM"],
            full_name="Dr. Nakamura",
            signature_data=_make_svg_signature("Dr. Nakamura"),
        )
        t1_nurse1 = User(
            tenant_id=tenant1.id,
            username="nurse1",
            password_hash=generate_password_hash(default_pw),
            role_id=t1_nurse_role.id,
            credentials=["RN", "CARN"],
            full_name="Priya Sharma",
            signature_data=_make_svg_signature("Priya Sharma"),
        )
        t1_tech = User(
            tenant_id=tenant1.id,
            username="technician1",
            password_hash=generate_password_hash(default_pw),
            role_id=t1_roles["technician"].id,
            credentials=["LCDC"],
            full_name="Jordan Kim",
            signature_data=_make_svg_signature("Jordan Kim"),
        )
        t1_tech2 = User(
            tenant_id=tenant1.id,
            username="technician3",
            password_hash=generate_password_hash(default_pw),
            role_id=t1_roles["technician"].id,
            credentials=["LCDC-I"],
            full_name="Dani Orozco",
            signature_data=_make_svg_signature("Dani Orozco"),
        )
        t1_frontdesk = User(
            tenant_id=tenant1.id,
            username="frontdesk1",
            password_hash=generate_password_hash(default_pw),
            role_id=t1_frontdesk_role.id,
            credentials=[],
            full_name="Taylor Brooks",
            signature_data=_make_svg_signature("Taylor Brooks"),
        )
        t1_auditor = User(
            tenant_id=tenant1.id,
            username="auditor1",
            password_hash=generate_password_hash(default_pw),
            role_id=t1_roles["auditor"].id,
            credentials=[],
            full_name="Sam Reeves",
            signature_data=_make_svg_signature("Sam Reeves"),
        )

        t1_users = [t1_admin, t1_psych, t1_psych2, t1_nurse1, t1_tech, t1_tech2, t1_frontdesk, t1_auditor]

        # Tenant 2 staff (smaller)
        t2_admin = User(
            tenant_id=tenant2.id,
            username="admin2",
            password_hash=generate_password_hash(default_pw),
            role_id=t2_roles["admin"].id,
            credentials=[],
            full_name="Casey Zhang",
            signature_data=_make_svg_signature("Casey Zhang"),
        )
        t2_psych = User(
            tenant_id=tenant2.id,
            username="psychiatrist2",
            password_hash=generate_password_hash(default_pw),
            role_id=t2_roles["psychiatrist"].id,
            credentials=["MD", "FASAM"],
            full_name="Dr. Santos",
            signature_data=_make_svg_signature("Dr. Santos"),
        )
        t2_tech = User(
            tenant_id=tenant2.id,
            username="technician2",
            password_hash=generate_password_hash(default_pw),
            role_id=t2_roles["technician"].id,
            credentials=["RN"],
            full_name="Alex Rivera",
            signature_data=_make_svg_signature("Alex Rivera"),
        )

        t2_users = [t2_admin, t2_psych, t2_tech]

        db.session.add_all(t1_users + t2_users)
        db.session.commit()

        # ── Care Teams (Tenant 1) ──
        # Detox Unit Team — handles acute withdrawal patients (Unit A + B beds)
        ct_detox = CareTeam(tenant_id=tenant1.id, name="Detox Unit Team")
        # Outpatient/IOP Team — handles PHP/IOP patients who don't need beds
        ct_iop = CareTeam(tenant_id=tenant1.id, name="IOP/PHP Team")
        # Intake Team — handles new admissions and pending patients
        ct_intake = CareTeam(tenant_id=tenant1.id, name="Intake Team")

        db.session.add_all([ct_detox, ct_iop, ct_intake])
        db.session.flush()

        # Assign staff to care teams
        care_team_members = [
            # Detox Unit Team: Dr. Fierro (lead psychiatrist), Nurse Sharma, Tech Kim
            CareTeamMember(care_team_id=ct_detox.id, user_id=t1_psych.id),
            CareTeamMember(care_team_id=ct_detox.id, user_id=t1_nurse1.id),
            CareTeamMember(care_team_id=ct_detox.id, user_id=t1_tech.id),
            # IOP/PHP Team: Dr. Nakamura, Tech Orozco
            CareTeamMember(care_team_id=ct_iop.id, user_id=t1_psych2.id),
            CareTeamMember(care_team_id=ct_iop.id, user_id=t1_tech2.id),
            # Intake Team: Front desk coordinator + nurse for screening
            CareTeamMember(care_team_id=ct_intake.id, user_id=t1_frontdesk.id),
            CareTeamMember(care_team_id=ct_intake.id, user_id=t1_nurse1.id),
        ]
        db.session.add_all(care_team_members)

        # Care Teams (Tenant 2) — single team for small clinic
        ct_harbor = CareTeam(tenant_id=tenant2.id, name="Primary Care Team")
        db.session.add(ct_harbor)
        db.session.flush()
        db.session.add_all([
            CareTeamMember(care_team_id=ct_harbor.id, user_id=t2_psych.id),
            CareTeamMember(care_team_id=ct_harbor.id, user_id=t2_tech.id),
        ])

        db.session.commit()

        # ── Patients (Tenant 1 — 15 patients) ──
        seed_now = datetime.now(timezone.utc)

        # Realistic patient data for a Texas detox/behavioral health facility
        t1_patient_data = [
            # (first, last, dob, gender, pronouns, diagnosis, insurance, risk, care_team, status_info, extra_clinical)
            # --- 3 Pending (intake team) ---
            ("Maria", "Gonzalez", date(1988, 3, 14), "Female", "She/Her",
             "F10.239 Alcohol use disorder, severe", "Medicaid", "high", ct_intake,
             {"status": "pending"},
             {"phone": "(512) 555-0101", "emergency_contact_name": "Rosa Gonzalez",
              "emergency_contact_phone": "(512) 555-8801", "emergency_contact_relationship": "Mother",
              "marital_status": "Divorced", "preferred_language": "Spanish",
              "ethnicity": "Hispanic/Latino", "employment_status": "Unemployed",
              "address_street": "2314 E Riverside Dr", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78741"}),

            ("James", "Carter", date(1995, 7, 22), "Male", "He/Him",
             "F11.20 Opioid use disorder, severe", "Blue Shield", "high", ct_intake,
             {"status": "pending"},
             {"phone": "(512) 555-0102", "emergency_contact_name": "Linda Carter",
              "emergency_contact_phone": "(512) 555-8802", "emergency_contact_relationship": "Mother",
              "marital_status": "Single", "preferred_language": "English",
              "ethnicity": "Black/African American", "employment_status": "Part-time",
              "referring_provider": "Dr. Anand, PCP",
              "current_medications": "None currently — previously on Suboxone",
              "address_street": "901 W MLK Blvd", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78701"}),

            ("Brittany", "Marsh", date(2000, 1, 9), "Female", "She/Her",
             "F14.20 Cocaine use disorder, moderate", "Aetna", "moderate", ct_intake,
             {"status": "pending"},
             {"phone": "(512) 555-0103", "emergency_contact_name": "Kevin Marsh",
              "emergency_contact_phone": "(512) 555-8803", "emergency_contact_relationship": "Father",
              "marital_status": "Single", "preferred_language": "English",
              "ethnicity": "White", "employment_status": "Student",
              "address_street": "5620 N Lamar Blvd", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78756"}),

            # --- 8 Active / Admitted (detox unit team — in beds) ---
            ("Emily", "Tran", date(1990, 11, 5), "Female", "She/Her",
             "F10.239 Alcohol use disorder, severe", "Aetna", "high", ct_detox,
             {"status": "active", "admitted_days_ago": 2},
             {"phone": "(512) 555-0104", "emergency_contact_name": "David Tran",
              "emergency_contact_phone": "(512) 555-8804", "emergency_contact_relationship": "Spouse",
              "marital_status": "Married", "preferred_language": "English",
              "ethnicity": "Asian", "employment_status": "Full-time",
              "current_medications": "Librium 25mg q6h taper, Zofran 4mg PRN",
              "allergies": "Sulfa drugs", "pharmacy": "CVS Pharmacy - S Congress",
              "primary_care_physician": "Dr. Pham",
              "address_street": "1100 S Lamar Blvd", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78704"}),

            ("Robert", "Kim", date(1983, 2, 28), "Male", "He/Him",
             "F11.20 Opioid use disorder, severe", "United Health", "high", ct_detox,
             {"status": "active", "admitted_days_ago": 4},
             {"phone": "(512) 555-0105", "emergency_contact_name": "Susan Kim",
              "emergency_contact_phone": "(512) 555-8805", "emergency_contact_relationship": "Wife",
              "marital_status": "Married", "preferred_language": "English",
              "ethnicity": "Asian", "employment_status": "Unemployed",
              "current_medications": "Suboxone 8mg/2mg SL daily, Clonidine 0.1mg TID",
              "allergies": "NKDA", "pharmacy": "Walgreens - Manchaca",
              "referring_provider": "Dr. Wells, Pain Management",
              "address_street": "6800 Manchaca Rd", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78745"}),

            ("Carlos", "Mendez", date(1979, 5, 19), "Male", "He/Him",
             "F10.239 Alcohol use disorder, severe", "Kaiser", "high", ct_detox,
             {"status": "active", "admitted_days_ago": 1},
             {"phone": "(512) 555-0106", "emergency_contact_name": "Ana Mendez",
              "emergency_contact_phone": "(512) 555-8806", "emergency_contact_relationship": "Sister",
              "marital_status": "Single", "preferred_language": "Spanish",
              "ethnicity": "Hispanic/Latino", "employment_status": "Self-employed",
              "current_medications": "Ativan 2mg q4h PRN, Thiamine 100mg daily, Folate 1mg daily",
              "allergies": "Penicillin",
              "address_street": "3200 E 12th St", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78702"}),

            ("Sandra", "Williams", date(2000, 9, 3), "Female", "She/Her",
             "F13.20 Sedative use disorder, moderate", "Cigna", "moderate", ct_detox,
             {"status": "active", "admitted_days_ago": 3},
             {"phone": "(512) 555-0107", "emergency_contact_name": "Patricia Williams",
              "emergency_contact_phone": "(512) 555-8807", "emergency_contact_relationship": "Mother",
              "marital_status": "Single", "preferred_language": "English",
              "ethnicity": "White", "employment_status": "Full-time",
              "current_medications": "Phenobarbital taper per protocol",
              "allergies": "NKDA", "pharmacy": "H-E-B Pharmacy - Mueller",
              "address_street": "1800 E 51st St", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78723"}),

            ("Marcus", "Davis", date(1986, 12, 1), "Male", "He/Him",
             "F11.20 Opioid use disorder, severe", "Medicaid", "high", ct_detox,
             {"status": "active", "admitted_days_ago": 5},
             {"phone": "(512) 555-0108", "emergency_contact_name": "Tanya Davis",
              "emergency_contact_phone": "(512) 555-8808", "emergency_contact_relationship": "Sister",
              "marital_status": "Divorced", "preferred_language": "English",
              "ethnicity": "Black/African American", "employment_status": "Unemployed",
              "current_medications": "Suboxone 16mg/4mg SL daily, Hydroxyzine 25mg TID",
              "allergies": "Codeine", "pharmacy": "CVS Pharmacy - Burnet Rd",
              "address_street": "7400 N Lamar Blvd", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78752"}),

            ("Ashley", "Johnson", date(1992, 8, 11), "Female", "She/Her",
             "F15.20 Stimulant use disorder, moderate", "Blue Shield", "moderate", ct_detox,
             {"status": "active", "admitted_days_ago": 6},
             {"phone": "(512) 555-0109", "emergency_contact_name": "Mike Johnson",
              "emergency_contact_phone": "(512) 555-8809", "emergency_contact_relationship": "Brother",
              "marital_status": "Single", "preferred_language": "English",
              "ethnicity": "White", "employment_status": "Unemployed",
              "current_medications": "Seroquel 100mg QHS, Trazodone 50mg QHS",
              "allergies": "NKDA",
              "address_street": "4500 Duval St", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78751"}),

            # --- 2 Active (IOP/PHP team — no beds, outpatient) ---
            ("Rachel", "Lee", date(1997, 4, 17), "Female", "She/Her",
             "F10.10 Alcohol use disorder, mild", "Aetna", "low", ct_iop,
             {"status": "active", "admitted_days_ago": 14},
             {"phone": "(512) 555-0110", "emergency_contact_name": "Tom Lee",
              "emergency_contact_phone": "(512) 555-8810", "emergency_contact_relationship": "Father",
              "marital_status": "Single", "preferred_language": "English",
              "ethnicity": "Asian", "employment_status": "Full-time",
              "current_medications": "Naltrexone 50mg daily",
              "allergies": "NKDA", "pharmacy": "Walgreens - Anderson Ln",
              "address_street": "9500 Anderson Mill Rd", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78729"}),

            ("Diego", "Salazar", date(1991, 10, 25), "Male", "He/Him",
             "F12.20 Cannabis use disorder, moderate", "Cigna", "low", ct_iop,
             {"status": "active", "admitted_days_ago": 10},
             {"phone": "(512) 555-0111", "emergency_contact_name": "Carmen Salazar",
              "emergency_contact_phone": "(512) 555-8811", "emergency_contact_relationship": "Mother",
              "marital_status": "Single", "preferred_language": "English",
              "ethnicity": "Hispanic/Latino", "employment_status": "Full-time",
              "current_medications": "None",
              "allergies": "NKDA",
              "address_street": "2200 S Pleasant Valley Rd", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78741"}),

            # --- 2 Discharged (completed program) ---
            ("Thomas", "Brown", date(1974, 1, 30), "Male", "He/Him",
             "F10.239 Alcohol use disorder, severe", "Kaiser", "moderate", ct_detox,
             {"status": "inactive", "admitted_days_ago": 21, "discharged_days_ago": 3, "discharge_reason": "completed"},
             {"phone": "(512) 555-0112", "emergency_contact_name": "Janet Brown",
              "emergency_contact_phone": "(512) 555-8812", "emergency_contact_relationship": "Wife",
              "marital_status": "Married", "preferred_language": "English",
              "ethnicity": "White", "employment_status": "Retired",
              "current_medications": "Naltrexone 50mg daily, Gabapentin 300mg TID",
              "allergies": "Aspirin",
              "address_street": "1200 Barton Springs Rd", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78704"}),

            ("Keisha", "Robinson", date(1989, 6, 8), "Female", "She/Her",
             "F11.20 Opioid use disorder, severe", "Medicaid", "high", ct_detox,
             {"status": "inactive", "admitted_days_ago": 30, "discharged_days_ago": 7, "discharge_reason": "completed"},
             {"phone": "(512) 555-0113", "emergency_contact_name": "Denise Robinson",
              "emergency_contact_phone": "(512) 555-8813", "emergency_contact_relationship": "Mother",
              "marital_status": "Single", "preferred_language": "English",
              "ethnicity": "Black/African American", "employment_status": "Part-time",
              "current_medications": "Vivitrol injection monthly, Buspirone 10mg BID",
              "allergies": "NKDA", "pharmacy": "CVS Pharmacy - S Congress",
              "address_street": "3800 S 1st St", "address_city": "Austin",
              "address_state": "TX", "address_zip": "78704"}),
        ]

        t1_patients = []
        for i, (first, last, dob, gender, pronouns, diag, ins, risk, care_team, status_info, clinical) in enumerate(t1_patient_data, start=1):
            pt_status = status_info["status"]
            pt_admitted_at = None
            pt_discharged_at = None
            pt_discharge_reason = None

            if pt_status == "active":
                pt_admitted_at = seed_now - timedelta(days=status_info["admitted_days_ago"])
            elif pt_status == "inactive":
                pt_admitted_at = seed_now - timedelta(days=status_info["admitted_days_ago"])
                pt_discharged_at = seed_now - timedelta(days=status_info["discharged_days_ago"])
                pt_discharge_reason = status_info["discharge_reason"]

            p = Patient(
                tenant_id=tenant1.id,
                patient_code=f"PT-{i:03d}",
                first_name=first,
                last_name=last,
                date_of_birth=dob,
                gender=gender,
                pronouns=pronouns,
                phone=clinical.get("phone", f"(512) 555-{i:04d}"),
                email=f"{first.lower()}.{last.lower()}@example.com",
                status=pt_status,
                risk_level=risk,
                primary_diagnosis=diag,
                insurance=ins,
                care_team_id=care_team.id,
                admitted_at=pt_admitted_at,
                discharged_at=pt_discharged_at,
                discharge_reason=pt_discharge_reason,
                # Demographics
                marital_status=clinical.get("marital_status"),
                preferred_language=clinical.get("preferred_language"),
                ethnicity=clinical.get("ethnicity"),
                employment_status=clinical.get("employment_status"),
                # Address
                address_street=clinical.get("address_street"),
                address_city=clinical.get("address_city"),
                address_state=clinical.get("address_state"),
                address_zip=clinical.get("address_zip"),
                # Emergency contact
                emergency_contact_name=clinical.get("emergency_contact_name"),
                emergency_contact_phone=clinical.get("emergency_contact_phone"),
                emergency_contact_relationship=clinical.get("emergency_contact_relationship"),
                # Clinical
                current_medications=clinical.get("current_medications"),
                allergies=clinical.get("allergies"),
                referring_provider=clinical.get("referring_provider"),
                primary_care_physician=clinical.get("primary_care_physician"),
                pharmacy=clinical.get("pharmacy"),
            )
            t1_patients.append(p)

        # Tenant 2: 5 patients
        t2_patients = []
        t2_data = [
            ("Luis", "Reyes", date(1990, 6, 10), "Male", "He/Him",
             "F11.20 Opioid use disorder, severe", "Medi-Cal", "high"),
            ("Tanya", "Nguyen", date(1985, 3, 22), "Female", "She/Her",
             "F10.239 Alcohol use disorder, severe", "Aetna", "high"),
            ("Derek", "Patel", date(1993, 9, 5), "Male", "He/Him",
             "F14.20 Cocaine use disorder, moderate", "Medi-Cal", "moderate"),
            ("Monica", "Torres", date(1978, 12, 15), "Female", "She/Her",
             "F11.20 Opioid use disorder, severe", "Aetna", "high"),
            ("Kevin", "Okafor", date(2001, 1, 28), "Male", "He/Him",
             "F12.20 Cannabis use disorder, mild", "Medi-Cal", "low"),
        ]
        for i, (first, last, dob, gender, pronouns, diag, ins, risk) in enumerate(t2_data, start=1):
            p = Patient(
                tenant_id=tenant2.id,
                patient_code=f"PT-{i:03d}",
                first_name=first,
                last_name=last,
                date_of_birth=dob,
                gender=gender,
                pronouns=pronouns,
                phone=f"(713) 555-{i:04d}",
                email=f"{first.lower()}.{last.lower()}@harbor.example.com",
                status="active",
                risk_level=risk,
                primary_diagnosis=diag,
                insurance=ins,
                care_team_id=ct_harbor.id,
                admitted_at=seed_now - timedelta(days=i + 1),
            )
            t2_patients.append(p)

        db.session.add_all(t1_patients + t2_patients)
        db.session.commit()

        # ── Beds (Tenant 1 — Aeglero Detox) ──
        t1_bed_data = [
            # (display_name, unit, room, bed_label, sort_order, status)
            ("Bed A-1", "Detox Unit A", "101", "1", 1, "available"),
            ("Bed A-2", "Detox Unit A", "102", "2", 2, "available"),
            ("Bed A-3", "Detox Unit A", "103", "3", 3, "available"),
            ("Bed A-4", "Detox Unit A", "104", "4", 4, "available"),
            ("Bed B-1", "Detox Unit B", "201", "1", 1, "available"),
            ("Bed B-2", "Detox Unit B", "202", "2", 2, "available"),
            ("Bed B-3", "Detox Unit B", "203", "3", 3, "available"),
            ("Bed B-4", "Detox Unit B", "204", "4", 4, "available"),
            ("Bed B-5", "Detox Unit B", "205", "5", 5, "cleaning"),
            ("Bed B-6", "Detox Unit B", "206", "6", 6, "out_of_service"),
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

        # Assign active detox patients (indices 3-9, which are Emily through Ashley) to beds
        active_detox = [p for p in t1_patients if p.status == "active" and p.care_team_id == ct_detox.id]
        available_beds = [b for b in t1_beds if b.status == "available"]
        for patient, bed in zip(active_detox, available_beds):
            patient.assigned_bed_id = bed.id

        db.session.commit()

        # ── Audit Logs ──
        audit_actions = [
            ("SEED", "database", t1_admin, 1),
            ("LOGIN", "session", t1_psych, 0),
            ("LOGIN", "session", t1_nurse1, 0),
            ("VIEW_PATIENT", "patient/PT-004", t1_psych, 0),
            ("UPDATE_PATIENT", "patient/PT-005", t1_nurse1, 0),
            ("CREATE_FORM", "form/ciwa-ar", t1_nurse1, 0),
        ]
        for action, resource, user, days_ago in audit_actions:
            db.session.add(AuditLog(
                tenant_id=tenant1.id,
                user_id=user.id,
                action=action,
                resource=resource,
                ip_address="127.0.0.1",
                status="SUCCESS",
                timestamp=seed_now - timedelta(days=days_ago, hours=random.randint(0, 12)),
            ))
        db.session.add(AuditLog(
            tenant_id=tenant2.id,
            user_id=t2_admin.id,
            action="SEED",
            resource="database",
            ip_address="127.0.0.1",
            status="SUCCESS",
            timestamp=seed_now - timedelta(days=1),
        ))
        db.session.commit()

        now = datetime.now(timezone.utc)

        # ── Form Templates (one set per tenant) ──
        for tenant, creator in [(tenant1, t1_admin), (tenant2, t2_admin)]:
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
        t1_intake_tmpl = FormTemplate.query.filter_by(tenant_id=tenant1.id, name="New Patient Intake Form").first()
        t1_symptom = FormTemplate.query.filter_by(tenant_id=tenant1.id, name="Symptom Checklist").first()

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

        # Completed intake forms for active detox patients (filled by front desk)
        if t1_intake_tmpl:
            for i, p in enumerate(t1_patients[3:10]):  # active detox patients
                db.session.add(completed_form(
                    tenant_id=tenant1.id,
                    patient_id=p.id,
                    template_id=t1_intake_tmpl.id,
                    form_data={
                        "Full Name": f"{p.first_name} {p.last_name}",
                        "Date of Birth": p.date_of_birth.isoformat() if p.date_of_birth else "",
                        "Primary Insurance": p.insurance or "",
                        "Emergency Contact": f"{p.emergency_contact_name} - {p.emergency_contact_phone}",
                        "Reason for Visit": p.primary_diagnosis or "Initial assessment",
                        "Medical History": "See chart for full history",
                        "Current Medications": p.current_medications or "None",
                        "Consent Acknowledgment": "Yes",
                    },
                    filled_by=t1_frontdesk.id,
                    signed_by_name=t1_frontdesk.full_name,
                    days_ago=i + 2,
                ))

        # Symptom checklists (filled by nurse during screening)
        if t1_symptom:
            symptom_sets = [
                (["Anxiety", "Insomnia", "Fatigue", "Irritability"], "1-3 months", "Severe"),
                (["Depression", "Loss of Appetite", "Insomnia"], "2-4 weeks", "Moderate"),
                (["Anxiety", "Panic Attacks", "Difficulty Concentrating"], "3-6 months", "Moderate"),
                (["Insomnia", "Fatigue", "Loss of Appetite", "Irritability"], "2-4 weeks", "Severe"),
            ]
            for p, (symptoms, duration, severity) in zip(t1_patients[3:7], symptom_sets):
                f = PatientForm(
                    tenant_id=tenant1.id,
                    patient_id=p.id,
                    template_id=t1_symptom.id,
                    form_data={
                        "Current Symptoms": symptoms,
                        "Symptom Duration": duration,
                        "Severity": severity,
                        "Previous Treatment": "Yes",
                        "Additional Notes": f"Screening completed at admission for {p.first_name} {p.last_name}.",
                    },
                    status="draft",
                    filled_by=t1_nurse1.id,
                )
                db.session.add(f)

        # Tenant 2 forms
        t2_intake_tmpl = FormTemplate.query.filter_by(tenant_id=tenant2.id, name="New Patient Intake Form").first()
        if t2_intake_tmpl:
            for i, p in enumerate(t2_patients[:3]):
                db.session.add(completed_form(
                    tenant_id=tenant2.id,
                    patient_id=p.id,
                    template_id=t2_intake_tmpl.id,
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
                    signed_by_name=t2_tech.full_name,
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

        # CIWA scores for alcohol detox patients (Emily Tran, Carlos Mendez)
        if t1_ciwa:
            # Emily Tran — day 2, moderate withdrawal
            db.session.add(completed_form(
                tenant_id=tenant1.id, patient_id=t1_patients[3].id, template_id=t1_ciwa.id,
                form_data=ciwa_data(3, 2, 2, 3, 2, 1, 1, 1, 2, 0, 96, "134/82", 99.0, 18, "Moderate withdrawal. Librium taper on schedule. Tolerating PO fluids."),
                filled_by=t1_nurse1.id, signed_by_name=t1_nurse1.full_name, days_ago=1,
            ))
            # Carlos Mendez — day 1, severe withdrawal (just admitted)
            db.session.add(completed_form(
                tenant_id=tenant1.id, patient_id=t1_patients[5].id, template_id=t1_ciwa.id,
                form_data=ciwa_data(5, 4, 4, 5, 4, 2, 2, 2, 3, 1, 114, "148/96", 100.2, 22, "Severe withdrawal on admission. Ativan 2mg IV given. Continuous monitoring. Dr. Fierro notified."),
                filled_by=t1_nurse1.id, signed_by_name=t1_nurse1.full_name, days_ago=0,
            ))
            # Sandra Williams — day 3, improving
            db.session.add(completed_form(
                tenant_id=tenant1.id, patient_id=t1_patients[6].id, template_id=t1_ciwa.id,
                form_data=ciwa_data(1, 1, 1, 2, 1, 0, 0, 0, 1, 0, 78, "120/74", 98.4, 16, "Withdrawal resolving. Phenobarbital taper step-down today. Patient resting comfortably."),
                filled_by=t1_nurse1.id, signed_by_name=t1_nurse1.full_name, days_ago=0,
            ))

        # COWS for opioid patients
        t1_cows = FormTemplate.query.filter_by(tenant_id=tenant1.id, name="COWS").first()
        if t1_cows:
            # Robert Kim — day 4, moderate withdrawal stabilizing
            db.session.add(completed_form(
                tenant_id=tenant1.id, patient_id=t1_patients[4].id, template_id=t1_cows.id,
                form_data={
                    "Resting Pulse Rate (0=≤80, 1=81–100, 2=101–120, 4=>120)": 1,
                    "Sweating (0=none, 1=barely perceptible, 2=beads on brow, 3=streams, 4=drenching)": 1,
                    "Restlessness (0=able to sit still, 1=hard time sitting still, 3=frequent shifting, 5=unable to sit)": 1,
                    "Pupil Size (0=normal/pinpoint, 1=possibly larger, 2=moderately dilated, 5=max dilation)": 1,
                    "Bone or Joint Aches (0=none, 1=mild diffuse, 2=patient reports severe, 4=patient rubbing joints)": 2,
                    "Runny Nose or Tearing (0=none, 1=nasal stuffiness, 2=runny nose, 4=tears streaming)": 1,
                    "GI Upset (0=none, 1=stomach cramps, 2=nausea/loose stool, 3=vomiting/diarrhea, 5=multiple episodes)": 1,
                    "Tremor (0=none, 1=can feel, 2=can observe, 4=gross tremor)": 1,
                    "Yawning (0=none, 1=once/twice, 2=three or more times, 4=several times/min)": 2,
                    "Anxiety or Irritability (0=none, 1=patient reports, 2=patient obviously irritable, 4=patient so irritable)": 1,
                    "Gooseflesh Skin (0=smooth, 3=piloerection can be felt, 5=prominent piloerection)": 0,
                    "Clinician Notes": "COWS 12 — mild. Suboxone dose stable. Patient tolerating well. Continue current regimen.",
                },
                filled_by=t1_nurse1.id, signed_by_name=t1_nurse1.full_name, days_ago=1,
            ))
            # Marcus Davis — day 5, improving
            db.session.add(completed_form(
                tenant_id=tenant1.id, patient_id=t1_patients[7].id, template_id=t1_cows.id,
                form_data={
                    "Resting Pulse Rate (0=≤80, 1=81–100, 2=101–120, 4=>120)": 0,
                    "Sweating (0=none, 1=barely perceptible, 2=beads on brow, 3=streams, 4=drenching)": 0,
                    "Restlessness (0=able to sit still, 1=hard time sitting still, 3=frequent shifting, 5=unable to sit)": 0,
                    "Pupil Size (0=normal/pinpoint, 1=possibly larger, 2=moderately dilated, 5=max dilation)": 0,
                    "Bone or Joint Aches (0=none, 1=mild diffuse, 2=patient reports severe, 4=patient rubbing joints)": 1,
                    "Runny Nose or Tearing (0=none, 1=nasal stuffiness, 2=runny nose, 4=tears streaming)": 0,
                    "GI Upset (0=none, 1=stomach cramps, 2=nausea/loose stool, 3=vomiting/diarrhea, 5=multiple episodes)": 0,
                    "Tremor (0=none, 1=can feel, 2=can observe, 4=gross tremor)": 0,
                    "Yawning (0=none, 1=once/twice, 2=three or more times, 4=several times/min)": 1,
                    "Anxiety or Irritability (0=none, 1=patient reports, 2=patient obviously irritable, 4=patient so irritable)": 1,
                    "Gooseflesh Skin (0=smooth, 3=piloerection can be felt, 5=prominent piloerection)": 0,
                    "Clinician Notes": "COWS 3 — minimal. Day 5, withdrawal largely resolved. Discharge planning initiated.",
                },
                filled_by=t1_nurse1.id, signed_by_name=t1_nurse1.full_name, days_ago=0,
            ))

        if t2_ciwa:
            db.session.add(completed_form(
                tenant_id=tenant2.id, patient_id=t2_patients[1].id, template_id=t2_ciwa.id,
                form_data=ciwa_data(2, 2, 2, 2, 1, 1, 1, 1, 2, 0, 92, "126/80", 98.8, 17, "Stable but monitoring."),
                filled_by=t2_tech.id, signed_by_name=t2_tech.full_name, days_ago=2,
            ))

        db.session.commit()

        # ── Summary ──
        print()
        print("Seed complete!")
        print()
        print("Tenants:")
        print(f"  1. {tenant1.name} (slug: {tenant1.slug})")
        print(f"  2. {tenant2.name} (slug: {tenant2.slug})")
        print()
        print("Login credentials (Password for all: Password123!):")
        print(f"  Aeglero:")
        print(f"    admin1        — Administrator (Morgan Lee)")
        print(f"    psychiatrist1 — Psychiatrist (Dr. Fierro)")
        print(f"    psychiatrist3 — Psychiatrist (Dr. Nakamura)")
        print(f"    nurse1        — Registered Nurse (Priya Sharma)")
        print(f"    technician1   — Technician (Jordan Kim)")
        print(f"    technician3   — Technician (Dani Orozco)")
        print(f"    frontdesk1    — Front Desk Coordinator (Taylor Brooks)")
        print(f"    auditor1      — Auditor (Sam Reeves)")
        print(f"  Harbor:")
        print(f"    admin2 / psychiatrist2 / technician2")
        print()
        print("Care Teams (Aeglero):")
        print(f"  Detox Unit Team  — Dr. Fierro, Priya Sharma (RN), Jordan Kim (Tech)")
        print(f"  IOP/PHP Team     — Dr. Nakamura, Dani Orozco (Tech)")
        print(f"  Intake Team      — Taylor Brooks (Front Desk), Priya Sharma (RN)")
        print(f"  Harbor: Primary Care Team — Dr. Santos, Alex Rivera")
        print()
        pending = sum(1 for p in t1_patients if p.status == "pending")
        active = sum(1 for p in t1_patients if p.status == "active")
        inactive = sum(1 for p in t1_patients if p.status == "inactive")
        print(f"Patients: {len(t1_patients)} (Aeglero) + {len(t2_patients)} (Harbor)")
        print(f"  Aeglero — {pending} pending, {active} active ({len(active_detox)} in beds + {active - len(active_detox)} IOP/PHP), {inactive} discharged")
        print(f"  Harbor  — {len(t2_patients)} active")
        print()
        occupied = sum(1 for b in t1_beds if any(p.assigned_bed_id == b.id for p in t1_patients))
        print(f"Beds (Aeglero): {len(t1_beds)} total — {occupied} occupied, 1 cleaning, 1 out of service")
        print("Form templates and sample forms created for both tenants.")


if __name__ == "__main__":
    seed()
