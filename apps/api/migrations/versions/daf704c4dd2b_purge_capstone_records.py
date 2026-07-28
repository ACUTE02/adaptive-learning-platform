"""purge_capstone_records

Revision ID: daf704c4dd2b
Revises: 32f89ea1894a
Create Date: 2026-07-03 09:31:59.189835

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa # noqa: F401
import sqlmodel # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'daf704c4dd2b'
down_revision: Union[str, None] = '32f89ea1894a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM assessment WHERE type='capstone';")
    op.execute("DELETE FROM campaign_module WHERE title ILIKE '%%capstone%%';")


def downgrade() -> None:
    pass
