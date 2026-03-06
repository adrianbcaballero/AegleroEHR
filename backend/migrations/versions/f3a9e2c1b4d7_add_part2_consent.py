"""add 42 CFR Part 2 consent table

Revision ID: f3a9e2c1b4d7
Revises: 1d811683784b
Create Date: 2026-03-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3a9e2c1b4d7'
down_revision = '1d811683784b'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'part2_consent',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('receiving_party', sa.String(200), nullable=False),
        sa.Column('purpose', sa.Text(), nullable=False),
        sa.Column('information_scope', sa.Text(), nullable=False),
        sa.Column('expiration', sa.String(200), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('patient_signature', sa.String(200), nullable=True),
        sa.Column('signed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_by', sa.Integer(), nullable=True),
        sa.Column('revocation_reason', sa.String(255), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patient.id']),
        sa.ForeignKeyConstraint(['revoked_by'], ['user.id']),
        sa.ForeignKeyConstraint(['created_by'], ['user.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenant.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_part2_consent_tenant_id', 'part2_consent', ['tenant_id'])
    op.create_index('ix_part2_consent_patient_id', 'part2_consent', ['patient_id'])


def downgrade():
    op.drop_index('ix_part2_consent_patient_id', table_name='part2_consent')
    op.drop_index('ix_part2_consent_tenant_id', table_name='part2_consent')
    op.drop_table('part2_consent')
