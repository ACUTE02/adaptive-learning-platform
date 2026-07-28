import os
import re

migration_file = r"E:\project\adaptive-learning-platform\apps\api\migrations\versions\597945333b63_add_current_retention_score.py"

with open(migration_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the entire upgrade function
upgrade_replacement = """def upgrade() -> None:
    op.add_column('campaign_module', sa.Column('current_retention_score', sa.Integer(), nullable=False, server_default='100'))

"""

# Replace the entire downgrade function
downgrade_replacement = """def downgrade() -> None:
    op.drop_column('campaign_module', 'current_retention_score')

"""

# Find and replace the functions using regex
content = re.sub(r'def upgrade\(\) -> None:.*?(?=def downgrade\(\) -> None:)', upgrade_replacement, content, flags=re.DOTALL)
content = re.sub(r'def downgrade\(\) -> None:.*', downgrade_replacement, content, flags=re.DOTALL)

with open(migration_file, 'w', encoding='utf-8') as f:
    f.write(content)

print("Migration file cleaned successfully!")
