"""drop treatment_plan table

Revision ID: c2d3e4f5a6b7
Revises: a1c2d3e4f5b6
Create Date: 2026-03-06

"""
from alembic import op
import sqlalchemy as sa

revision = 'c2d3e4f5a6b7'
down_revision = 'a1c2d3e4f5b6'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('treatment_plan')


def downgrade():
    op.create_table(
        'treatment_plan',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('review_date', sa.Date(), nullable=True),
        sa.Column('goals', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patient.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenant.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('patient_id'),
    )
    op.create_index('ix_treatment_plan_patient_id', 'treatment_plan', ['patient_id'])
    op.create_index('ix_treatment_plan_tenant_id', 'treatment_plan', ['tenant_id'])
