"""redefine permissions — granular RBAC

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-03-09 00:00:00.000000

Replaces the old flat permission set with the new granular permission groups:
  patients.*, frontdesk.*, archive.*, workflows.*, careteam.*, audit.*, users.*, roles.*, consent.*
Removes global forms.* permissions (per-template FormTemplateAccess handles form access).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column

# revision identifiers
revision = "i9j0k1l2m3n4"
down_revision = "h8i9j0k1l2m3"
branch_labels = None
depends_on = None

role_t = table("role", column("id", sa.Integer), column("name", sa.String))
perm_t = table("role_permission", column("id", sa.Integer), column("role_id", sa.Integer), column("permission", sa.String))

NEW_SYSTEM_ROLE_PERMISSIONS = {
    "admin": [
        "patients.view", "patients.view.all", "patients.edit", "patients.create", "patients.delete",
        "frontdesk.view", "frontdesk.beds.manage",
        "frontdesk.patients.create", "frontdesk.patients.pending",
        "archive.view", "archive.export", "archive.manage",
        "workflows.view", "workflows.manage",
        "careteam.manage",
        "audit.view", "users.view", "users.manage", "roles.manage",
        "consent.manage",
    ],
    "psychiatrist": [
        "patients.view", "patients.view.all", "patients.create", "patients.edit",
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


def upgrade():
    bind = op.get_bind()

    # Get all system role ids
    roles = bind.execute(
        sa.select(role_t.c.id, role_t.c.name).where(role_t.c.name.in_(list(NEW_SYSTEM_ROLE_PERMISSIONS.keys())))
    ).fetchall()

    for role_id, role_name in roles:
        # Remove all existing permissions for this system role
        bind.execute(perm_t.delete().where(perm_t.c.role_id == role_id))

        # Insert new permissions
        for perm in NEW_SYSTEM_ROLE_PERMISSIONS.get(role_name, []):
            bind.execute(perm_t.insert().values(role_id=role_id, permission=perm))


def downgrade():
    # Not reversible — would need old permission set
    pass
