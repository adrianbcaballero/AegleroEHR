"""add photo column to patient table

Revision ID: 95c9b984b770
Revises: 89b8b2ae5603
Create Date: 2026-03-26 19:35:07.029125

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '95c9b984b770'
down_revision = '89b8b2ae5603'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.add_column(sa.Column('photo', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.drop_column('photo')
