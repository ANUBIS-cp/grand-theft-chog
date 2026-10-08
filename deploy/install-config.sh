#!/usr/bin/env bash
# Installs the Caddy and systemd files from deploy/ on the server. Run on the server as root from a release dir.
set -euo pipefail
cd "$(dirname "$0")"
install -m 0644 caddy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
for u in systemd/*.service; do install -m 0644 "$u" /etc/systemd/system/; done
# Non-secret settings. Secrets (db.env, keys) are created by hand and never come from the repo.
touch /etc/chog-city/app.env
grep -q '^PUBLIC_HOST=' /etc/chog-city/app.env || echo 'PUBLIC_HOST=chogcity.35-212-31-75.sslip.io' >> /etc/chog-city/app.env
grep -q '^IMAGES_DIR=' /etc/chog-city/app.env || echo 'IMAGES_DIR=/srv/chog-city/images' >> /etc/chog-city/app.env
# The key that signs live-city tickets: made once on the server, never printed, never in the repo.
grep -q '^CITY_SECRET=' /etc/chog-city/app.env || echo "CITY_SECRET=$(openssl rand -hex 32)" >> /etc/chog-city/app.env
chown root:chogcity /etc/chog-city/app.env && chmod 0640 /etc/chog-city/app.env
systemctl daemon-reload
systemctl reload caddy
echo "config installed"
