"""add episode model

Revision ID: 536d85726ac0
Revises: a4bb455d0cbe
Create Date: 2026-03-29 00:19:04.283055

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '536d85726ac0'
down_revision = 'a4bb455d0cbe'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Create episode table
    op.create_table('episode',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('episode_number', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('admitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('discharged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('discharge_reason', sa.String(length=80), nullable=True),
        sa.Column('assigned_bed_id', sa.Integer(), nullable=True),
        sa.Column('primary_diagnosis', sa.String(length=120), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['assigned_bed_id'], ['bed.id']),
        sa.ForeignKeyConstraint(['patient_id'], ['patient.id']),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenant.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('patient_id', 'episode_number', name='uq_patient_episode_number')
    )
    with op.batch_alter_table('episode', schema=None) as batch_op:
        batch_op.create_index('ix_episode_patient_id', ['patient_id'], unique=False)
        batch_op.create_index('ix_episode_tenant_id', ['tenant_id'], unique=False)

    # 2. Add current_episode_id to patient
    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.add_column(sa.Column('current_episode_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_patient_current_episode', 'episode', ['current_episode_id'], ['id'], use_alter=True)

    # 3. Add episode_id to patient_form
    with op.batch_alter_table('patient_form', schema=None) as batch_op:
        batch_op.add_column(sa.Column('episode_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_patient_form_episode_id', ['episode_id'], unique=False)
        batch_op.create_foreign_key('fk_patient_form_episode', 'episode', ['episode_id'], ['id'])

    # 4. Backfill: create an Episode for every existing patient
    conn = op.get_bind()
    patients = conn.execute(sa.text(
        "SELECT id, tenant_id, status, admitted_at, discharged_at, "
        "discharge_reason, assigned_bed_id, primary_diagnosis, readmission_count, created_at "
        "FROM patient"
    )).fetchall()

    for p in patients:
        # Map patient status to episode status
        if p.status == 'active':
            ep_status = 'active'
        elif p.status == 'inactive':
            ep_status = 'discharged'
        else:
            ep_status = 'pending'

        episode_number = (p.readmission_count or 0) + 1

        result = conn.execute(sa.text(
            "INSERT INTO episode "
            "(tenant_id, patient_id, episode_number, status, admitted_at, discharged_at, "
            "discharge_reason, assigned_bed_id, primary_diagnosis, created_at) "
            "VALUES (:tid, :pid, :enum, :st, :aat, :dat, :dr, :bid, :pd, :cat) "
            "RETURNING id"
        ), {
            "tid": p.tenant_id,
            "pid": p.id,
            "enum": episode_number,
            "st": ep_status,
            "aat": p.admitted_at,
            "dat": p.discharged_at,
            "dr": p.discharge_reason,
            "bid": p.assigned_bed_id,
            "pd": p.primary_diagnosis,
            "cat": p.created_at,
        })
        episode_id = result.fetchone()[0]

        # Set current_episode_id on patient
        conn.execute(sa.text(
            "UPDATE patient SET current_episode_id = :eid WHERE id = :pid"
        ), {"eid": episode_id, "pid": p.id})

        # Backfill episode_id on all forms for this patient
        conn.execute(sa.text(
            "UPDATE patient_form SET episode_id = :eid WHERE patient_id = :pid AND episode_id IS NULL"
        ), {"eid": episode_id, "pid": p.id})


def downgrade():
    with op.batch_alter_table('patient_form', schema=None) as batch_op:
        batch_op.drop_constraint('fk_patient_form_episode', type_='foreignkey')
        batch_op.drop_index('ix_patient_form_episode_id')
        batch_op.drop_column('episode_id')

    with op.batch_alter_table('patient', schema=None) as batch_op:
        batch_op.drop_constraint('fk_patient_current_episode', type_='foreignkey')
        batch_op.drop_column('current_episode_id')

    with op.batch_alter_table('episode', schema=None) as batch_op:
        batch_op.drop_index('ix_episode_tenant_id')
        batch_op.drop_index('ix_episode_patient_id')

    op.drop_table('episode')
