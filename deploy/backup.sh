#!/bin/sh
# Database backup: pg_dump (custom format) into ./backups, keeps the newest 14 files.
# Run from anywhere:  ./deploy/backup.sh
# Restore: see "Backup and restore" in DEPLOY.md.
set -eu
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"
OUT_DIR="${BACKUP_DIR:-backups}"
FILE="$OUT_DIR/learnhouse-$(date -u +%Y%m%d-%H%M%S).dump"

mkdir -p "$OUT_DIR"
# -T: no TTY, so it also works from cron. Write to a temp name first so a failed dump never leaves a bad file.
$COMPOSE exec -T postgres pg_dump -U learnhouse -d learnhouse -Fc > "$FILE.part"
mv "$FILE.part" "$FILE"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep only the 14 newest dumps
ls -1t "$OUT_DIR"/learnhouse-*.dump 2>/dev/null | tail -n +15 | while read -r old; do rm -f "$old"; done
