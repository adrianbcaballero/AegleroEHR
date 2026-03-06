from datetime import datetime, timezone
from extensions import db

class User(db.Model):
    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    username = db.Column(db.String(80), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    #Roles: psychiatrist, technician, admin
    role = db.Column(db.String(30), nullable=False)  
    full_name = db.Column(db.String(120), nullable=True)

    failed_login_attempts = db.Column(db.Integer, default=0, nullable=False)
    locked_until = db.Column(db.DateTime(timezone=True), nullable=True)
    permanently_locked = db.Column(db.Boolean, default=False, nullable=False)
    __table_args__ = (db.UniqueConstraint("tenant_id", "username", name="uq_tenant_username"),)

class Tenant(db.Model):
    __tablename__ = "tenant"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(80), unique=True, nullable=False)  # url-friendly identifier e.g. "sunrise-detox"
    status = db.Column(db.String(20), nullable=False, default="active")  # active/suspended
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Patient(db.Model):
    __tablename__ = "patient"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)

    #Unique patient code for refrencing 
    patient_code = db.Column(db.String(20), nullable=False)
    __table_args__ = (db.UniqueConstraint("tenant_id", "patient_code", name="uq_tenant_patient_code"),)

    first_name = db.Column(db.String(80), nullable=False)
    last_name = db.Column(db.String(80), nullable=False)
    date_of_birth = db.Column(db.Date, nullable=True)

    phone = db.Column(db.String(30), nullable=True)
    email = db.Column(db.String(120), nullable=True)

    status = db.Column(db.String(30), default="active", nullable=False)   #active/inactive/archived
    risk_level = db.Column(db.String(20), default="low", nullable=False)  #low/moderate/high

    primary_diagnosis = db.Column(db.String(120), nullable=True)
    insurance = db.Column(db.String(120), nullable=True)

    # Identity
    ssn_last4 = db.Column(db.String(4), nullable=True)
    gender = db.Column(db.String(30), nullable=True)
    pronouns = db.Column(db.String(30), nullable=True)
    marital_status = db.Column(db.String(30), nullable=True)
    preferred_language = db.Column(db.String(50), nullable=True)
    ethnicity = db.Column(db.String(60), nullable=True)
    employment_status = db.Column(db.String(30), nullable=True)

    # Address
    address_street = db.Column(db.String(200), nullable=True)
    address_city = db.Column(db.String(100), nullable=True)
    address_state = db.Column(db.String(50), nullable=True)
    address_zip = db.Column(db.String(20), nullable=True)

    # Emergency contact
    emergency_contact_name = db.Column(db.String(120), nullable=True)
    emergency_contact_phone = db.Column(db.String(30), nullable=True)
    emergency_contact_relationship = db.Column(db.String(60), nullable=True)

    # Clinical
    current_medications = db.Column(db.Text, nullable=True)
    allergies = db.Column(db.Text, nullable=True)
    referring_provider = db.Column(db.String(120), nullable=True)
    primary_care_physician = db.Column(db.String(120), nullable=True)
    pharmacy = db.Column(db.String(120), nullable=True)

    assigned_provider_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)


class UserSession(db.Model):
    __tablename__ = "user_session"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    session_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)


class AuditLog(db.Model):
    __tablename__ = "audit_log"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    timestamp = db.Column(db.DateTime(timezone=True),
    default=lambda: datetime.now(timezone.utc),
    nullable=False
    )


    user_id = db.Column(db.Integer, nullable=True)
    action = db.Column(db.String(80), nullable=False)
    resource = db.Column(db.String(120), nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)
    description = db.Column(db.String(255), nullable=True)

    #success or fail
    status = db.Column(db.String(20), nullable=False)  


class TreatmentPlan(db.Model):
    __tablename__ = "treatment_plan"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)

    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"), nullable=False, index=True, unique=True)

    start_date = db.Column(db.Date, nullable=True)
    review_date = db.Column(db.Date, nullable=True)

    #JSON goals list/object
    goals = db.Column(db.JSON, nullable=False, default=list)

    #active/archived
    status = db.Column(db.String(20), nullable=False, default="active")

    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )


class FormTemplate(db.Model):
    __tablename__ = "form_template"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), nullable=False)  # intake, assessment, consent, insurance, clinical, discharge
    description = db.Column(db.Text, nullable=True)

    # JSON array: [{label, type, options?, min?, max?}]
    # types: text, textarea, number, date, checkbox, checkbox_group, select, scale, signature
    fields = db.Column(db.JSON, nullable=False, default=list)

    # JSON array of role strings that can view forms created from this template
    allowed_roles = db.Column(db.JSON, nullable=False, default=lambda: ["admin", "psychiatrist", "technician"])

    status = db.Column(db.String(20), nullable=False, default="active")  # active/archived

    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class Part2Consent(db.Model):
    """
    42 CFR Part 2 consent record. Federal law requires written patient consent
    before any SUD treatment information can be disclosed to any third party.
    Each consent is specific to a receiving party and purpose.
    """
    __tablename__ = "part2_consent"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"), nullable=False, index=True)

    # Required disclosure fields per 42 CFR §2.31(a)
    receiving_party = db.Column(db.String(200), nullable=False)
    purpose = db.Column(db.Text, nullable=False)
    information_scope = db.Column(db.Text, nullable=False)
    expiration = db.Column(db.String(200), nullable=False)

    # status: active / revoked
    status = db.Column(db.String(20), nullable=False, default="active")

    # Patient signature
    patient_signature = db.Column(db.String(200), nullable=True)
    signed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    # Revocation tracking
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    revoked_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    revocation_reason = db.Column(db.String(255), nullable=True)

    created_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class PatientForm(db.Model):
    __tablename__ = "patient_form"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"), nullable=False, index=True)
    template_id = db.Column(db.Integer, db.ForeignKey("form_template.id"), nullable=False, index=True)

    # JSON object: {field_label: value}
    form_data = db.Column(db.JSON, nullable=False, default=dict)

    status = db.Column(db.String(20), nullable=False, default="draft")  # draft/completed

    filled_by = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )