"""add created_at and readmission_count to patient

Revision ID: a4bb455d0cbe
Revises: b7e4d1f08a23
Create Date: 2026-03-28 23:03:40.018247

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a4bb455d0cbe'
down_revision = 'b7e4d1f08a23'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))
        batch_op.add_column(sa.Column('readmission_count', sa.Integer(), server_default=sa.text('0'), nullable=False))


def downgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.drop_column('readmission_count')
        batch_op.drop_column('created_at')
