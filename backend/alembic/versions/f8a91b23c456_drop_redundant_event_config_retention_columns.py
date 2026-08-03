"""drop_redundant_event_config_retention_columns

Revision ID: f8a91b23c456
Revises: e7f89b12a345
Create Date: 2026-08-03 23:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f8a91b23c456'
down_revision: Union[str, None] = 'e7f89b12a345'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safely drop redundant retention_days and delete_time columns from event_configs table
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c['name'] for c in inspector.get_columns('event_configs')]

    if 'retention_days' in columns:
        op.drop_column('event_configs', 'retention_days')
    if 'delete_time' in columns:
        op.drop_column('event_configs', 'delete_time')


def downgrade() -> None:
    op.add_column('event_configs', sa.Column('delete_time', sa.String(length=16), nullable=True))
    op.add_column('event_configs', sa.Column('retention_days', sa.Integer(), nullable=True))
