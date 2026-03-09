"""add form_template_access table

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-03-08 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "form_template_access",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "template_id",
            sa.Integer,
            sa.ForeignKey("form_template.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "role_id",
            sa.Integer,
            sa.ForeignKey("role.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("access_level", sa.String(10), nullable=False, server_default="sign"),
        sa.UniqueConstraint("template_id", "role_id", name="uq_template_role_access"),
    )


def downgrade():
    op.drop_table("form_template_access")
