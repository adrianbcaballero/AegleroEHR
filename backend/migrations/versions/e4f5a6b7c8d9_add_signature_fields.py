"""add signature fields

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'e4f5a6b7c8d9'
down_revision = 'd3e4f5a6b7c8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('signature_data', sa.Text(), nullable=True))
    op.add_column('patient_form', sa.Column('signature_image', sa.Text(), nullable=True))
    op.add_column('patient_form', sa.Column('signed_by_name', sa.String(length=200), nullable=True))
    op.add_column('patient_form', sa.Column('signed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('patient_form', 'signed_at')
    op.drop_column('patient_form', 'signed_by_name')
    op.drop_column('patient_form', 'signature_image')
    op.drop_column('user', 'signature_data')
