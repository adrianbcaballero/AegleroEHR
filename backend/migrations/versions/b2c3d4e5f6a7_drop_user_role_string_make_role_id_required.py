"""drop user.role string column and make role_id non-nullable

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-07 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column, select


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    # Safety: assign any users still missing role_id to the tenant's "technician" role
    user_t = table("user", column("id", sa.Integer), column("tenant_id", sa.Integer), column("role_id", sa.Integer))
    role_t = table("role", column("id", sa.Integer), column("tenant_id", sa.Integer), column("name", sa.String))

    orphaned = bind.execute(
        select(user_t.c.id, user_t.c.tenant_id).where(user_t.c.role_id.is_(None))
    ).fetchall()

    for (user_id, tenant_id) in orphaned:
        fallback = bind.execute(
            select(role_t.c.id).where(
                (role_t.c.tenant_id == tenant_id) & (role_t.c.name == "technician")
            )
        ).scalar()
        if fallback:
            bind.execute(user_t.update().where(user_t.c.id == user_id).values(role_id=fallback))

    # Make role_id non-nullable and drop the legacy role string column
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.alter_column("role_id", existing_type=sa.Integer(), nullable=False)
        batch_op.drop_column("role")


def downgrade():
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.add_column(sa.Column("role", sa.String(length=30), nullable=True))
        batch_op.alter_column("role_id", existing_type=sa.Integer(), nullable=True)
