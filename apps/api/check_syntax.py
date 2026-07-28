import ast
import os
import sys
import traceback

root_dir = r"e:\project\adaptive-learning-platform\apps\api\src"
failed_files = []

for dirpath, dirnames, filenames in os.walk(root_dir):
    if '.venv' in dirpath or '__pycache__' in dirpath:
        continue
    for filename in filenames:
        if filename.endswith('.py'):
            filepath = os.path.join(dirpath, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                ast.parse(content, filename=filepath)
            except SyntaxError as e:
                print(f"SyntaxError in {filepath}: {e}")
                failed_files.append(filepath)

if failed_files:
    print(f"Found {len(failed_files)} files with syntax errors.")
    sys.exit(1)
else:
    print("All python files parsed successfully!")
    sys.exit(0)
