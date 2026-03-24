"""add invite_token table and make password_hash nullable

Revision ID: 89b8b2ae5603
Revises: c85f417d08da
Create Date: 2026-03-24 07:26:05.498727

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '89b8b2ae5603'
down_revision = 'c85f417d08da'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('invite_token',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('token', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('tenant_id', sa.Integer(), nullable=False),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['user.id'], ),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenant.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('invite_token', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_invite_token_token'), ['token'], unique=True)

    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column('password_hash',
               existing_type=sa.VARCHAR(length=255),
               nullable=True)


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column('password_hash',
               existing_type=sa.VARCHAR(length=255),
               nullable=False)

    with op.batch_alter_table('invite_token', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_invite_token_token'))

    op.drop_table('invite_token')
