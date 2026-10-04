#!/bin/sh
# Creates the first admin and the demo student in the default org (safe to re-run).
# Emails and passwords come from .env (LEARNHOUSE_INITIAL_ADMIN_*, DEMO_STUDENT_*).
set -eu
cd "$(dirname "$0")/.."
exec docker compose -f docker-compose.prod.yml exec -T api uv run python scripts/create_users.py
