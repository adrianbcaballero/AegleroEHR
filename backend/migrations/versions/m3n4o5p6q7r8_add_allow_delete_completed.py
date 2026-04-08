"""add forms.delete_completed, consolidate patient permissions

Revision ID: m3n4o5p6q7r8
Revises: c3a7e1f04821
Create Date: 2026-03-30 00:00:00.000000
"""
from alembic import op
from sqlalchemy.sql import table, column, select
import sqlalchemy as sa

revision = "m3n4o5p6q7r8"
down_revision = "c3a7e1f04821"
branch_labels = None
depends_on = None

PERMISSION = "forms.delete_completed"
ROLES = ["admin"]


def upgrade():
    # Drop the old per-template column if it exists (may have been applied already)
    bind = op.get_bind()
    has_column = bind.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'form_template' AND column_name = 'allow_delete_completed'"
    )).scalar()
    if has_column:
        op.drop_column("form_template", "allow_delete_completed")

    # Add the permission to system roles
    role_t = table("role", column("id", sa.Integer), column("name", sa.String))
    perm_t = table("role_permission", column("id", sa.Integer), column("role_id", sa.Integer), column("permission", sa.String))

    roles = bind.execute(
        select(role_t.c.id, role_t.c.name).where(role_t.c.name.in_(ROLES))
    ).fetchall()

    for role_id, _name in roles:
        existing = bind.execute(
            select(perm_t.c.id).where(
                (perm_t.c.role_id == role_id) & (perm_t.c.permission == PERMISSION)
            )
        ).scalar()
        if not existing:
            bind.execute(perm_t.insert().values(role_id=role_id, permission=PERMISSION))

    # Remove retired permissions from all roles
    bind.execute(perm_t.delete().where(perm_t.c.permission == "patients.delete"))

    # Consolidate patients.create → frontdesk.patients.create
    # For each role that has patients.create, grant frontdesk.patients.create if missing
    rows_with_old = bind.execute(
        select(perm_t.c.role_id).where(perm_t.c.permission == "patients.create")
    ).fetchall()
    for (role_id,) in rows_with_old:
        already = bind.execute(
            select(perm_t.c.id).where(
                (perm_t.c.role_id == role_id) & (perm_t.c.permission == "frontdesk.patients.create")
            )
        ).scalar()
        if not already:
            bind.execute(perm_t.insert().values(role_id=role_id, permission="frontdesk.patients.create"))
    bind.execute(perm_t.delete().where(perm_t.c.permission == "patients.create"))

    # Consolidate workflows.view → workflows.manage
    rows_with_wv = bind.execute(
        select(perm_t.c.role_id).where(perm_t.c.permission == "workflows.view")
    ).fetchall()
    for (role_id,) in rows_with_wv:
        already = bind.execute(
            select(perm_t.c.id).where(
                (perm_t.c.role_id == role_id) & (perm_t.c.permission == "workflows.manage")
            )
        ).scalar()
        if not already:
            bind.execute(perm_t.insert().values(role_id=role_id, permission="workflows.manage"))
    bind.execute(perm_t.delete().where(perm_t.c.permission == "workflows.view"))

    # Consolidate users.view → users.manage
    rows_with_uv = bind.execute(
        select(perm_t.c.role_id).where(perm_t.c.permission == "users.view")
    ).fetchall()
    for (role_id,) in rows_with_uv:
        already = bind.execute(
            select(perm_t.c.id).where(
                (perm_t.c.role_id == role_id) & (perm_t.c.permission == "users.manage")
            )
        ).scalar()
        if not already:
            bind.execute(perm_t.insert().values(role_id=role_id, permission="users.manage"))
    bind.execute(perm_t.delete().where(perm_t.c.permission == "users.view"))


def downgrade():
    bind = op.get_bind()
    perm_t = table("role_permission", column("id", sa.Integer), column("role_id", sa.Integer), column("permission", sa.String))
    bind.execute(perm_t.delete().where(perm_t.c.permission == PERMISSION))
