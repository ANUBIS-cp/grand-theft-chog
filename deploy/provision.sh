#!/usr/bin/env bash
# One-time server setup for Chog City (Ubuntu 24.04). Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
DOMAIN="${1:?usage: provision.sh <domain>}"

apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https postgresql-16 git jq unzip >/dev/null

# Node 24 (NodeSource)
if ! node -v 2>/dev/null | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

# Caddy (official repo)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

# Service user, folders, secrets folder
id chogcity >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/chog-city --shell /usr/sbin/nologin chogcity
install -d -o chogcity -g chogcity -m 0755 /opt/chog-city /opt/chog-city/releases /var/lib/chog-city/images
install -d -o root -g chogcity -m 0750 /etc/chog-city

# Postgres: database + role with a generated password (never printed)
if [ ! -f /etc/chog-city/db.env ]; then
  PW=$(openssl rand -hex 24)
  sudo -u postgres psql -qc "CREATE ROLE chogcity LOGIN PASSWORD '$PW';" 
  sudo -u postgres psql -qc "CREATE DATABASE chogcity OWNER chogcity;"
  (umask 077; printf 'DATABASE_URL=postgres://chogcity:%s@127.0.0.1:5432/chogcity\n' "$PW" > /etc/chog-city/db.env)
  chown root:chogcity /etc/chog-city/db.env; chmod 0640 /etc/chog-city/db.env
fi

# 2 GB swap so builds never run out of memory
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Placeholder site until the app is deployed
install -d -m 0755 /var/www/chog-city
[ -f /var/www/chog-city/index.html ] || echo '<!doctype html><title>Chog City</title><p>Chog City is being built.</p>' > /var/www/chog-city/index.html
chmod 0644 /var/www/chog-city/index.html
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  encode zstd gzip
  root * /var/www/chog-city
  file_server
}
CADDY
systemctl reload caddy || systemctl restart caddy
echo "node $(node -v) | $(psql --version) | $(caddy version | cut -d' ' -f1)"
