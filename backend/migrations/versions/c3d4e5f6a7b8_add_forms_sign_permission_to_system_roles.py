"""add forms.sign permission to system roles

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-07 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column, select


revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None

# Roles that should receive forms.sign
ROLES_WITH_SIGN = {"admin", "psychiatrist", "technician"}


def upgrade():
    bind = op.get_bind()

    role_t = table("role", column("id", sa.Integer), column("name", sa.String), column("is_system_default", sa.Boolean))
    perm_t = table("role_permission", column("role_id", sa.Integer), column("permission", sa.String))

    roles = bind.execute(
        select(role_t.c.id, role_t.c.name)
        .where(role_t.c.is_system_default == True)
        .where(role_t.c.name.in_(list(ROLES_WITH_SIGN)))
    ).fetchall()

    for (role_id, role_name) in roles:
        # Skip if already exists (idempotent)
        existing = bind.execute(
            select(perm_t.c.role_id)
            .where(perm_t.c.role_id == role_id)
            .where(perm_t.c.permission == "forms.sign")
        ).scalar()
        if not existing:
            bind.execute(perm_t.insert().values(role_id=role_id, permission="forms.sign"))


def downgrade():
    bind = op.get_bind()
    perm_t = table("role_permission", column("role_id", sa.Integer), column("permission", sa.String))
    role_t = table("role", column("id", sa.Integer), column("name", sa.String), column("is_system_default", sa.Boolean))

    roles = bind.execute(
        select(role_t.c.id).where(role_t.c.is_system_default == True).where(role_t.c.name.in_(list(ROLES_WITH_SIGN)))
    ).fetchall()

    for (role_id,) in roles:
        bind.execute(
            perm_t.delete()
            .where(perm_t.c.role_id == role_id)
            .where(perm_t.c.permission == "forms.sign")
        )
