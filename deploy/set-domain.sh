#!/usr/bin/env bash
# Moves the site to a new address (e.g. a DuckDNS name), keeping the old one as a redirect.
# Usage (from the repo root on the Mac): deploy/set-domain.sh grandtheftchog.duckdns.org
# First point the name at the server (35.212.31.75). This checks it does before changing anything, then:
# makes it the main name in PUBLIC_HOST, rebuilds Caddy's config (Caddy fetches the HTTPS certificate by
# itself) and restarts the web app and live server so logins and the live city accept it.
set -euo pipefail
NEW=${1:?usage: deploy/set-domain.sh new.host.name}
IP=35.212.31.75
SSH=(ssh -i "$HOME/.ssh/flipper_gcp" -o ConnectTimeout=15 ubuntu@$IP)

GOT=$(dig +short "$NEW" A @1.1.1.1 | tail -n1)
[ "$GOT" = "$IP" ] || { echo "$NEW points at '${GOT:-nothing}', not $IP. Set it on duckdns.org first."; exit 1; }

"${SSH[@]}" "
  set -e
  OLD=\$(sudo grep -m1 '^PUBLIC_HOST=' /etc/chog-city/app.env | cut -d= -f2)
  LIST=\$(echo \"$NEW,\$OLD\" | tr ',' '\n' | awk 'NF && !seen[\$0]++' | paste -sd, -)
  sudo sed -i \"s|^PUBLIC_HOST=.*|PUBLIC_HOST=\$LIST|\" /etc/chog-city/app.env
  echo \"PUBLIC_HOST=\$LIST\"
  sudo bash /opt/chog-city/current/deploy/install-config.sh
  sudo systemctl restart chog-city-web chog-city-live
"
for i in $(seq 1 20); do curl -fsS -o /dev/null "https://$NEW/api/health" && break; sleep 3; done
curl -fsS -o /dev/null "https://$NEW/api/health" && echo "https://$NEW is live (old names redirect to it)"
