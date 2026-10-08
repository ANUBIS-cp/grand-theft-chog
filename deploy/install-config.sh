#!/usr/bin/env bash
# Installs the Caddy and systemd files from deploy/ on the server. Run on the server as root from a release dir.
set -euo pipefail
cd "$(dirname "$0")"
install -m 0644 caddy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
for u in systemd/*.service; do install -m 0644 "$u" /etc/systemd/system/; done
systemctl daemon-reload
systemctl reload caddy
echo "config installed"
