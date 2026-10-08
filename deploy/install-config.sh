#!/usr/bin/env bash
# Installs the Caddy and systemd files from deploy/ on the server. Run on the server as root from a release dir.
set -euo pipefail
cd "$(dirname "$0")"
install -m 0644 caddy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
for u in systemd/*.service; do install -m 0644 "$u" /etc/systemd/system/; done
# Non-secret settings. Secrets (db.env, keys) are created by hand and never come from the repo.
[ -f /etc/chog-city/app.env ] || printf 'PUBLIC_HOST=chogcity.35-212-31-75.sslip.io\n' > /etc/chog-city/app.env
chown root:chogcity /etc/chog-city/app.env && chmod 0640 /etc/chog-city/app.env
systemctl daemon-reload
systemctl reload caddy
echo "config installed"
