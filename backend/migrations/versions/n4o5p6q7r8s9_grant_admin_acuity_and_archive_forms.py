"""grant patients.acuity and archive.forms.manage to existing admin roles

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-04-29 00:00:00.000000

These permissions were added to ALL_PERMISSIONS after admin roles were already
seeded in tenants, so existing admin roles do not have them. Backfill them here.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column, select


revision = "n4o5p6q7r8s9"
down_revision = "m3n4o5p6q7r8"
branch_labels = None
depends_on = None

PERMISSIONS = ["patients.acuity", "archive.forms.manage"]
ROLES = ["admin"]


def upgrade():
    bind = op.get_bind()

    role_t = table("role", column("id", sa.Integer), column("name", sa.String), column("is_system_default", sa.Boolean))
    perm_t = table("role_permission", column("id", sa.Integer), column("role_id", sa.Integer), column("permission", sa.String))

    roles = bind.execute(
        select(role_t.c.id, role_t.c.name)
        .where(role_t.c.is_system_default == True)
        .where(role_t.c.name.in_(ROLES))
    ).fetchall()

    for role_id, _name in roles:
        for perm in PERMISSIONS:
            existing = bind.execute(
                select(perm_t.c.id).where(
                    (perm_t.c.role_id == role_id) & (perm_t.c.permission == perm)
                )
            ).scalar()
            if not existing:
                bind.execute(perm_t.insert().values(role_id=role_id, permission=perm))


def downgrade():
    bind = op.get_bind()
    role_t = table("role", column("id", sa.Integer), column("name", sa.String), column("is_system_default", sa.Boolean))
    perm_t = table("role_permission", column("id", sa.Integer), column("role_id", sa.Integer), column("permission", sa.String))

    roles = bind.execute(
        select(role_t.c.id)
        .where(role_t.c.is_system_default == True)
        .where(role_t.c.name.in_(ROLES))
    ).fetchall()

    for (role_id,) in roles:
        for perm in PERMISSIONS:
            bind.execute(
                perm_t.delete()
                .where(perm_t.c.role_id == role_id)
                .where(perm_t.c.permission == perm)
            )
