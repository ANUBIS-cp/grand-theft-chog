#!/usr/bin/env bash
# Installs the Caddy and systemd files from deploy/ on the server. Run on the server as root from a release dir.
set -euo pipefail
cd "$(dirname "$0")"
for u in systemd/*.service systemd/*.timer; do install -m 0644 "$u" /etc/systemd/system/; done
install -m 0755 backup.sh /usr/local/bin/chog-city-backup
# Non-secret settings. Secrets (db.env, keys) are created by hand and never come from the repo.
touch /etc/chog-city/app.env
grep -q '^PUBLIC_HOST=' /etc/chog-city/app.env || echo 'PUBLIC_HOST=chogcity.35-212-31-75.sslip.io' >> /etc/chog-city/app.env
# The site's names: the first is the real address, the rest redirect to it (deploy/set-domain.sh adds one).
HOSTS=$(grep -m1 '^PUBLIC_HOST=' /etc/chog-city/app.env | cut -d= -f2)
MAIN=${HOSTS%%,*}
{
  sed "s/__MAIN__/$MAIN/" caddy/Caddyfile.template
  for h in $(echo "$HOSTS" | tr ',' ' '); do
    [ "$h" = "$MAIN" ] && continue
    printf '\n%s {\n\tredir https://%s{uri} permanent\n}\n' "$h" "$MAIN"
  done
} > /etc/caddy/Caddyfile.new
caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null
mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
grep -q '^IMAGES_DIR=' /etc/chog-city/app.env || echo 'IMAGES_DIR=/srv/chog-city/images' >> /etc/chog-city/app.env
# Where the live server keeps the last chat messages between restarts.
grep -q '^CHAT_FILE=' /etc/chog-city/app.env || echo 'CHAT_FILE=/var/lib/chog-city/chat.json' >> /etc/chog-city/app.env
# The key that signs live-city tickets: made once on the server, never printed, never in the repo.
grep -q '^CITY_SECRET=' /etc/chog-city/app.env || echo "CITY_SECRET=$(openssl rand -hex 32)" >> /etc/chog-city/app.env
chown root:chogcity /etc/chog-city/app.env && chmod 0640 /etc/chog-city/app.env
systemctl daemon-reload
systemctl enable --now chog-city-backup.timer
systemctl reload caddy
echo "config installed"
