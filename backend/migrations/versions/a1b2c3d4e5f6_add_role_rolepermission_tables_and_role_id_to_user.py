"""add Role and RolePermission tables, role_id and credentials to user, seed system defaults

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-03-07 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column, select


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


SYSTEM_ROLE_PERMISSIONS = {
    "admin": [
        "patients.view", "patients.view_all",
        "patients.create", "patients.edit",
        "patients.admit", "patients.discharge",
        "forms.view", "forms.edit",
        "templates.view", "templates.manage",
        "categories.manage",
        "consent.manage",
        "users.manage",
        "roles.manage",
        "audit.view",
    ],
    "psychiatrist": [
        "patients.view", "patients.view_all",
        "patients.create", "patients.edit",
        "patients.admit", "patients.discharge",
        "forms.view", "forms.edit",
        "templates.view", "templates.manage",
        "categories.manage",
        "consent.manage",
        "audit.view",
    ],
    "technician": [
        "patients.view",
        "patients.edit",
        "forms.view", "forms.edit",
        "consent.manage",
    ],
    "auditor": [
        "patients.view", "patients.view_all",
        "forms.view",
        "templates.view",
        "audit.view",
    ],
}

SYSTEM_ROLE_DISPLAY = {
    "admin": "Administrator",
    "psychiatrist": "Psychiatrist",
    "technician": "Technician",
    "auditor": "Auditor",
}


def upgrade():
    # ── Create role table ────────────────────────────────────────────────────
    op.create_table(
        "role",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenant.id"), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("is_system_default", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_tenant_role_name"),
    )
    op.create_index("ix_role_tenant_id", "role", ["tenant_id"])

    # ── Create role_permission table ─────────────────────────────────────────
    op.create_table(
        "role_permission",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("role.id"), nullable=False),
        sa.Column("permission", sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("role_id", "permission", name="uq_role_permission"),
    )
    op.create_index("ix_role_permission_role_id", "role_permission", ["role_id"])

    # ── Add role_id and credentials to user ──────────────────────────────────
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(sa.Column("role_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("credentials", sa.JSON(), nullable=True))
        batch_op.create_foreign_key("fk_user_role_id", "role", ["role_id"], ["id"])

    op.create_index("ix_user_role_id", "user", ["role_id"])

    # ── Seed system roles and migrate existing users ─────────────────────────
    bind = op.get_bind()

    tenant_t = table("tenant", column("id", sa.Integer))
    role_t = table(
        "role",
        column("id", sa.Integer),
        column("tenant_id", sa.Integer),
        column("name", sa.String),
        column("display_name", sa.String),
        column("is_system_default", sa.Boolean),
    )
    role_perm_t = table(
        "role_permission",
        column("role_id", sa.Integer),
        column("permission", sa.String),
    )
    user_t = table(
        "user",
        column("id", sa.Integer),
        column("tenant_id", sa.Integer),
        column("role", sa.String),
        column("role_id", sa.Integer),
    )

    tenants = bind.execute(select(tenant_t.c.id)).fetchall()

    for (tenant_id,) in tenants:
        role_id_map = {}

        for role_name, display_name in SYSTEM_ROLE_DISPLAY.items():
            result = bind.execute(
                role_t.insert().values(
                    tenant_id=tenant_id,
                    name=role_name,
                    display_name=display_name,
                    is_system_default=True,
                ).returning(role_t.c.id)
            )
            role_db_id = result.scalar()
            role_id_map[role_name] = role_db_id

            perms = SYSTEM_ROLE_PERMISSIONS.get(role_name, [])
            if perms:
                bind.execute(
                    role_perm_t.insert(),
                    [{"role_id": role_db_id, "permission": p} for p in perms],
                )

        # Migrate existing users to role_id
        users = bind.execute(
            select(user_t.c.id, user_t.c.role).where(user_t.c.tenant_id == tenant_id)
        ).fetchall()

        for (user_id, old_role) in users:
            new_role_id = role_id_map.get(old_role)
            if new_role_id:
                bind.execute(
                    user_t.update()
                    .where(user_t.c.id == user_id)
                    .values(role_id=new_role_id)
                )


def downgrade():
    op.drop_index("ix_user_role_id", table_name="user")
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_constraint("fk_user_role_id", type_="foreignkey")
        batch_op.drop_column("credentials")
        batch_op.drop_column("role_id")

    op.drop_index("ix_role_permission_role_id", table_name="role_permission")
    op.drop_table("role_permission")
    op.drop_index("ix_role_tenant_id", table_name="role")
    op.drop_table("role")
