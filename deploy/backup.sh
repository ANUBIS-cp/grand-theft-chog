#!/usr/bin/env bash
# Nightly backup of the game's database and chat, kept for 14 days (run by chog-city-backup.timer).
# Restore: gunzip -c <file> | sudo -u postgres psql chogcity   (into an empty database)
set -euo pipefail
DIR=/var/backups/chog-city
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%d-%H%M)
sudo -u postgres pg_dump chogcity | gzip > "$DIR/nightly-$STAMP.sql.gz.part"
mv "$DIR/nightly-$STAMP.sql.gz.part" "$DIR/nightly-$STAMP.sql.gz"
[ -f /var/lib/chog-city/chat.json ] && cp -a /var/lib/chog-city/chat.json "$DIR/chat-$STAMP.json"
find "$DIR" -name 'nightly-*.sql.gz' -mtime +14 -delete
find "$DIR" -name 'chat-2*.json' -mtime +14 -delete
echo "backup $STAMP: $(du -h "$DIR/nightly-$STAMP.sql.gz" | cut -f1)"
