"""drop deprecated patient columns

Revision ID: 14e254cc4595
Revises: 536d85726ac0
Create Date: 2026-03-29 01:28:23.359812

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '14e254cc4595'
down_revision = '536d85726ac0'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.drop_constraint('fk_patient_assigned_bed', type_='foreignkey')
        batch_op.drop_column('admitted_at')
        batch_op.drop_column('discharge_reason')
        batch_op.drop_column('discharged_at')
        batch_op.drop_column('assigned_bed_id')


def downgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.add_column(sa.Column('assigned_bed_id', sa.INTEGER(), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('discharged_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('discharge_reason', sa.VARCHAR(length=80), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('admitted_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True))
        batch_op.create_foreign_key('fk_patient_assigned_bed', 'bed', ['assigned_bed_id'], ['id'], ondelete='SET NULL')
