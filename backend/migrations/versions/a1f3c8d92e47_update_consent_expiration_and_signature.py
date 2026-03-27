"""update consent expiration to date and signature to text

Revision ID: a1f3c8d92e47
Revises: 86731022dd22
Create Date: 2026-03-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1f3c8d92e47"
down_revision = "86731022dd22"
branch_labels = None
depends_on = None


def upgrade():
    # Convert expiration from varchar to date
    op.execute(
        "ALTER TABLE part2_consent "
        "ALTER COLUMN expiration TYPE date USING expiration::date"
    )
    # Convert patient_signature from varchar(200) to text for base64 data
    op.alter_column(
        "part2_consent",
        "patient_signature",
        type_=sa.Text(),
        existing_type=sa.String(200),
        existing_nullable=True,
    )


def downgrade():
    op.alter_column(
        "part2_consent",
        "expiration",
        type_=sa.String(200),
        existing_type=sa.Date(),
        existing_nullable=False,
    )
    op.alter_column(
        "part2_consent",
        "patient_signature",
        type_=sa.String(200),
        existing_type=sa.Text(),
        existing_nullable=True,
    )
