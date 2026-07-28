import os
import re
import traceback

def clean_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Failed reading {filepath}: {e}")
        return

    if 'src.db.courses' not in content and 'src.routers.courses' not in content:
        return

    # Fall back to simple regex line deletion
    lines = content.split('\n')
    new_lines = []
    changed = False
    for line in lines:
        if 'src.db.courses' in line or 'src.routers.courses' in line:
            changed = True
            print(f"Removing line from {filepath}: {line.strip()}")
            continue
        new_lines.append(line)
        
    if changed:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write('\n'.join(new_lines))
            print(f"Cleaned {filepath}")
        except Exception as e:
            print(f"Failed writing {filepath}: {e}")

def main():
    root_dir = r"e:\project\adaptive-learning-platform\apps\api\src"
    for dirpath, dirnames, filenames in os.walk(root_dir):
        if '.venv' in dirpath or '__pycache__' in dirpath or 'node_modules' in dirpath:
            continue
        for filename in filenames:
            if filename.endswith('.py'):
                clean_file(os.path.join(dirpath, filename))

if __name__ == "__main__":
    main()
