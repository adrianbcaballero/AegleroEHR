"""add MFA fields to user and tenant

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-03-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "l2m3n4o5p6q7"
down_revision = "k1l2m3n4o5p6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user", sa.Column("mfa_secret", sa.String(32), nullable=True))
    op.add_column("user", sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tenant", sa.Column("mfa_required", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("tenant", "mfa_required")
    op.drop_column("user", "mfa_enabled")
    op.drop_column("user", "mfa_secret")
