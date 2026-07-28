"""add_assessment_timestamp

Revision ID: 26e8254135b4
Revises: 37187aed6f40
Create Date: 2026-07-11 15:03:55.551231

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa # noqa: F401
import sqlmodel # noqa: F401
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '26e8254135b4'
down_revision: Union[str, None] = '37187aed6f40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assessment', sa.Column('updated_at', sa.DateTime(), nullable=True))
    

def downgrade() -> None:
    pass
    # ### end Alembic commands ###
