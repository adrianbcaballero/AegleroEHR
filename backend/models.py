from datetime import datetime, timezone
from extensions import db


# ─── PERMISSIONS ─────────────────────────────────────────────────────────────
# Canonical list of all permission strings used in require_auth(permission=).
# Roles are tenant-scoped bundles of these permissions.

ALL_PERMISSIONS = [
    # Patients
    "patients.view",                 # access the patients page
    "patients.view.all",             # see all patients regardless of care team
    "patients.edit",                 # edit patient record
    "patients.create",               # register new patient
    "patients.delete",               # delete / merge patients

    # Front Desk
    "frontdesk.view",                # see the front desk page (includes admissions + bed board)
    "frontdesk.beds.manage",         # manage beds (create / edit / delete)
    "frontdesk.patients.create",     # add patient via front desk
    "frontdesk.patients.pending",    # work on pending patients (admit / reject)

    # Archive
    "archive.view",                  # access archive page
    "archive.export",                # export records from archive
    "archive.manage",                # discharge, reactivate patients

    # Workflows
    "workflows.view",                # access workflows page
    "workflows.manage",              # create / edit / delete templates and categories

    # Care Teams
    "careteam.manage",               # create and assign care teams

    # System
    "audit.view",                    # access audit logs
    "users.view",                    # view user list
    "users.manage",                  # create / edit / lock / unlock users
    "roles.manage",                  # manage roles and permissions

    # Settings
    "settings.manage",               # manage tenant settings (MFA, security)

    # Consent (42 CFR Part 2)
    "consent.manage",                # create / revoke patient consent records
]

# Default permissions granted to each system role on creation
SYSTEM_ROLE_PERMISSIONS = {
    "admin": ALL_PERMISSIONS,
    "psychiatrist": [
        "patients.view", "patients.view.all",
        "patients.create", "patients.edit",
        "frontdesk.view", "frontdesk.patients.pending",
        "archive.view", "archive.manage",
        "workflows.view", "workflows.manage",
        "consent.manage",
        "audit.view",
        "users.view",
    ],
    "technician": [
        "patients.view",
        "patients.edit",
        "frontdesk.view",
        "consent.manage",
    ],
    "auditor": [
        "patients.view", "patients.view.all",
        "archive.view",
        "workflows.view",
        "audit.view",
    ],
}


class Role(db.Model):
    """Tenant-scoped role. Bundles a set of permissions for RBAC."""
    __tablename__ = "role"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    name = db.Column(db.String(50), nullable=False)          # slug: "admin", "psychiatrist", …
    display_name = db.Column(db.String(100), nullable=False)  # human label: "Administrator"
    is_system_default = db.Column(db.Boolean, nullable=False, default=False)

    permissions = db.relationship(
        "RolePermission", backref="role", cascade="all, delete-orphan", lazy="joined"
    )

    __table_args__ = (
        db.UniqueConstraint("tenant_id", "name", name="uq_tenant_role_name"),
    )

    def has_permission(self, permission: str) -> bool:
        return any(p.permission == permission for p in self.permissions)

    @property
    def permission_list(self):
        return [p.permission for p in self.permissions]


class RolePermission(db.Model):
    """Individual permission entry belonging to a Role."""
    __tablename__ = "role_permission"

    id = db.Column(db.Integer, primary_key=True)
    role_id = db.Column(db.Integer, db.ForeignKey("role.id"), nullable=False, index=True)
    permission = db.Column(db.String(50), nullable=False)

    __table_args__ = (
        db.UniqueConstraint("role_id", "permission", name="uq_role_permission"),
    )


class User(db.Model):
    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    username = db.Column(db.String(80), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)

    # Permission-based role FK
    role_id = db.Column(db.Integer, db.ForeignKey("role.id"), nullable=True, index=True)
    role_obj = db.relationship("Role", foreign_keys=[role_id], lazy="joined")

    # Professional credentials: ["MD", "LCDC", "RN", …]
    credentials = db.Column(db.JSON, nullable=True, default=list)

    full_name = db.Column(db.String(120), nullable=True)

    last_login = db.Column(db.DateTime(timezone=True), nullable=True)
    agreed_to_terms_at = db.Column(db.DateTime(timezone=True), nullable=True)

    failed_login_attempts = db.Column(db.Integer, default=0, nullable=False)
    locked_until = db.Column(db.DateTime(timezone=True), nullable=True)
    permanently_locked = db.Column(db.Boolean, default=False, nullable=False)
    signature_data = db.Column(db.Text, nullable=True)  # base64 data-URL of saved signature image

    mfa_secret = db.Column(db.String(32), nullable=True)   # TOTP shared secret (base32)
    mfa_enabled = db.Column(db.Boolean, default=False, nullable=False)

    __table_args__ = (db.UniqueConstraint("tenant_id", "username", name="uq_tenant_username"),)

    @property
    def role_name(self) -> str:
        """Role slug for inline checks (e.g. data-scoping logic). Falls back to legacy string."""
        if self.role_obj:
            return self.role_obj.name
        return self.role or ""

    def has_permission(self, permission: str) -> bool:
        if self.role_obj:
            return self.role_obj.has_permission(permission)
        return False

class Tenant(db.Model):
    __tablename__ = "tenant"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(80), unique=True, nullable=False)  # url-friendly identifier e.g. "sunrise-detox"
    status = db.Column(db.String(20), nullable=False, default="active")  # active/suspended
    category_order = db.Column(db.JSON, nullable=True, default=None)
    npi = db.Column(db.String(10), nullable=True)
    phone = db.Column(db.String(30), nullable=True)
    email = db.Column(db.String(120), nullable=True)
    address = db.Column(db.String(255), nullable=True)
    mfa_required = db.Column(db.Boolean, default=False, nullable=False)
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

    # Bed assignment — FK to bed.id, null if unassigned
    assigned_bed_id = db.Column(db.Integer, db.ForeignKey("bed.id"), nullable=True)
    assigned_bed = db.relationship(
        "Bed",
        backref=db.backref("current_patient", uselist=False),
        foreign_keys=[assigned_bed_id],
    )

    # Care team — null means any authenticated user can view this patient ("Everyone")
    care_team_id = db.Column(db.Integer, db.ForeignKey("care_team.id"), nullable=True)
    care_team = db.relationship("CareTeam", foreign_keys=[care_team_id])

    # ASAM Level of Care — updated automatically when ASAM assessment form is completed
    current_loc = db.Column(db.String(10), nullable=True)

    # Admission / discharge — tracks the current episode of care
    # On readmission, admitted_at is updated and discharge fields are cleared
    admitted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    discharged_at = db.Column(db.DateTime(timezone=True), nullable=True)
    discharge_reason = db.Column(db.String(80), nullable=True)  # completed / ama / transferred / other


class UserSession(db.Model):
    __tablename__ = "user_session"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    session_id = db.Column(db.String(64), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)


class Bed(db.Model):
    """
    Physical bed inventory for the tenant.
    Occupied status is derived: if current_patient (backref from Patient.assigned_bed_id)
    exists and patient.status == 'active', the bed is occupied.
    """
    __tablename__ = "bed"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)

    # Physical location hierarchy
    unit = db.Column(db.String(80), nullable=True)       # e.g. "Men's Detox", "Women's Detox"
    room = db.Column(db.String(20), nullable=True)       # e.g. "101"
    bed_label = db.Column(db.String(10), nullable=True)  # e.g. "A", "B"

    # Admin-supplied display label shown on the bed board (e.g. "101-A", "Bed 3")
    display_name = db.Column(db.String(50), nullable=False)

    # Optional notes for staff (e.g. "medical bed", "isolation room")
    notes = db.Column(db.String(200), nullable=True)

    # Availability status — "occupied" is derived, not stored here
    # available | cleaning | out_of_service
    status = db.Column(db.String(20), nullable=False, default="available")

    # False = decommissioned; excluded from capacity count and active bed board
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    # Display ordering within a unit
    sort_order = db.Column(db.Integer, nullable=False, default=0)


class CareTeam(db.Model):
    """A named group of users who share access to assigned patients."""
    __tablename__ = "care_team"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)

    members = db.relationship("CareTeamMember", backref="care_team", cascade="all, delete-orphan", lazy="joined")

    __table_args__ = (
        db.UniqueConstraint("tenant_id", "name", name="uq_tenant_care_team_name"),
    )


class CareTeamMember(db.Model):
    """Maps a user to a care team."""
    __tablename__ = "care_team_member"

    id = db.Column(db.Integer, primary_key=True)
    care_team_id = db.Column(db.Integer, db.ForeignKey("care_team.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)

    __table_args__ = (
        db.UniqueConstraint("care_team_id", "user_id", name="uq_care_team_member"),
    )


class AuditLog(db.Model):
    """
    Tamper-evident audit log implementing a SHA-256 hash chain.
    Each entry stores a hash of its own contents plus the previous entry's hash,
    satisfying ONC §170.315(d)(2) tamper-resistance requirements.
    """
    __tablename__ = "audit_log"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    timestamp = db.Column(db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user_id = db.Column(db.Integer, nullable=True)
    action = db.Column(db.String(80), nullable=False)
    resource = db.Column(db.String(120), nullable=False)
    ip_address = db.Column(db.String(45), nullable=True)
    description = db.Column(db.String(255), nullable=True)

    status = db.Column(db.String(20), nullable=False)  # SUCCESS / FAILED

    # Hash chain for tamper detection — ONC §170.315(d)(2)
    prev_hash = db.Column(db.String(64), nullable=True)   # SHA-256 of previous entry (null for first)
    entry_hash = db.Column(db.String(64), nullable=True)   # SHA-256 of this entry's contents + prev_hash



class FormTemplate(db.Model):
    __tablename__ = "form_template"

    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey("tenant.id"), nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    category = db.Column(db.String(50), nullable=False)  # intake, assessment, consent, insurance, clinical, discharge
    description = db.Column(db.Text, nullable=True)

    # JSON array: [{label, type, options?, min?, max?, optional?, note?}]
    # types: text, textarea, number, date, checkbox, checkbox_group, select, scale, signature
    fields = db.Column(db.JSON, nullable=False, default=list)

    # Recurring form generation
    is_recurring = db.Column(db.Boolean, nullable=False, default=False)
    recurrence_value = db.Column(db.Integer, nullable=True)    # e.g. 4, 8, 1
    recurrence_unit = db.Column(db.String(10), nullable=True)  # "hours", "days", "weeks"

    # JSON array of role strings that can view forms created from this template
    allowed_roles = db.Column(db.JSON, nullable=False, default=lambda: ["admin", "psychiatrist", "technician"])

    status = db.Column(db.String(20), nullable=False, default="active")  # active/archived

    # Admission / discharge gates
    required_for_admission = db.Column(db.Boolean, nullable=False, default=False)
    required_for_discharge = db.Column(db.Boolean, nullable=False, default=False)

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


class FormTemplateAccess(db.Model):
    """
    Per-template, per-role access level. Controls which actions each role
    can take when opening a form created from this template.

    access_level:
      "view" — read-only + Print
      "edit" — view + fill + Save Draft + Print
      "sign" — view + fill + Save Draft + Sign & Complete + Print
    """
    __tablename__ = "form_template_access"

    id = db.Column(db.Integer, primary_key=True)
    template_id = db.Column(
        db.Integer,
        db.ForeignKey("form_template.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_id = db.Column(
        db.Integer,
        db.ForeignKey("role.id", ondelete="CASCADE"),
        nullable=False,
    )
    access_level = db.Column(db.String(10), nullable=False, default="sign")

    __table_args__ = (
        db.UniqueConstraint("template_id", "role_id", name="uq_template_role_access"),
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

    # Embedded at sign time so signature is preserved even if user changes/deletes theirs
    signature_image = db.Column(db.Text, nullable=True)   # base64 data-URL
    signed_by_name = db.Column(db.String(200), nullable=True)
    signed_at = db.Column(db.DateTime(timezone=True), nullable=True)

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