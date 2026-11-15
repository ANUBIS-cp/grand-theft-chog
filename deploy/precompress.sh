#!/usr/bin/env bash
# Compresses the site's fixed files once, at deploy, so Caddy sends them ready-made (precompressed in the
# Caddyfile) instead of the web app compressing every file again for every visitor.
# Usage: precompress.sh <dir>  (the standalone app: its .next/static and public folders)
set -euo pipefail
for d in "$1/.next/static" "$1/public"; do
  [ -d "$d" ] || continue
  find "$d" -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.json' -o -name '*.txt' -o -name '*.woff' -o -name '*.ttf' \) -size +1k |
    while read -r f; do
      [ "$f.gz" -nt "$f" ] || gzip -k -9 -f "$f"
      [ "$f.zst" -nt "$f" ] || zstd -q -19 -f "$f" -o "$f.zst"
    done
done
