"""add mfa_pending_token table

Revision ID: efc3f8765b93
Revises: l2m3n4o5p6q7
Create Date: 2026-03-23 20:09:15.711801

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'efc3f8765b93'
down_revision = 'l2m3n4o5p6q7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('mfa_pending_token',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('token', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenant.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('mfa_pending_token', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_mfa_pending_token_token'), ['token'], unique=True)


def downgrade():
    with op.batch_alter_table('mfa_pending_token', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_mfa_pending_token_token'))

    op.drop_table('mfa_pending_token')
