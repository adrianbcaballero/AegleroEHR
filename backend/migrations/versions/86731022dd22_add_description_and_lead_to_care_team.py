"""add description and lead to care team

Revision ID: 86731022dd22
Revises: 5bc6e210c127
Create Date: 2026-03-27 03:55:27.975634

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '86731022dd22'
down_revision = '5bc6e210c127'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('care_team', schema=None) as batch_op:
        batch_op.add_column(sa.Column('description', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('lead_user_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_care_team_lead_user', 'user', ['lead_user_id'], ['id'])


def downgrade():
    with op.batch_alter_table('care_team', schema=None) as batch_op:
        batch_op.drop_constraint('fk_care_team_lead_user', type_='foreignkey')
        batch_op.drop_column('lead_user_id')
        batch_op.drop_column('description')
