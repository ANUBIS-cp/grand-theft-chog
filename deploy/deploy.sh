#!/usr/bin/env bash
# Ships the current commit to the server, builds it there, switches it live and checks it.
# Usage (from the repo root on the Mac): deploy/deploy.sh [--config]
set -euo pipefail
HOST=ubuntu@35.212.31.75
KEY="$HOME/.ssh/flipper_gcp"
SSH=(ssh -i "$KEY" -o ConnectTimeout=15 "$HOST")

[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first."; exit 1; }
SHA=$(git rev-parse --short=10 HEAD)
REL=/opt/chog-city/releases/$SHA
echo "deploying $SHA"

git archive --format=tar HEAD | "${SSH[@]}" "sudo install -d -o chogcity -g chogcity $REL && sudo -u chogcity tar -x -C $REL"

"${SSH[@]}" "sudo -u chogcity -H bash -c '
  set -e
  cd $REL
  export NEXT_TELEMETRY_DISABLED=1
  npm ci --no-audit --no-fund --loglevel=error
  npm run build --silent
  cd apps/web
  cp -r .next/static .next/standalone/apps/web/.next/
  if [ -d public ]; then cp -r public .next/standalone/apps/web/; fi
'"

if [ "${1:-}" = "--config" ]; then "${SSH[@]}" "sudo bash $REL/deploy/install-config.sh"; fi

"${SSH[@]}" "
  set -e
  sudo ln -sfn $REL /opt/chog-city/current
  sudo systemctl enable --quiet chog-city-web
  sudo systemctl restart chog-city-web
  for i in \$(seq 1 30); do curl -fsS -o /dev/null http://127.0.0.1:3000/ && break; sleep 1; done
  curl -fsS -o /dev/null http://127.0.0.1:3000/ && echo 'healthy'
  cd /opt/chog-city/releases && ls -1t | tail -n +6 | xargs -r sudo rm -rf
"
echo "live: https://chogcity.35-212-31-75.sslip.io/"
