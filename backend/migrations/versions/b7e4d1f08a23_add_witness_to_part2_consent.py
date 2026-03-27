"""add witness signature to part2 consent

Revision ID: b7e4d1f08a23
Revises: a1f3c8d92e47
Create Date: 2026-03-27 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b7e4d1f08a23"
down_revision = "a1f3c8d92e47"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("part2_consent", sa.Column("witness_signature", sa.Text(), nullable=True))
    op.add_column("part2_consent", sa.Column("witness_name", sa.String(200), nullable=True))


def downgrade():
    op.drop_column("part2_consent", "witness_name")
    op.drop_column("part2_consent", "witness_signature")
