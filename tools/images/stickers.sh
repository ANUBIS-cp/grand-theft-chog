#!/usr/bin/env bash
# Turns the Telegram ChogStikers pack (WebM video stickers, from get-stickers.mjs) into what the chat uses:
# an animated WebP per sticker (224px, plays everywhere with a see-through background, Safari included,
# which drops WebM transparency) and a small still for the picker. Usage: tools/images/stickers.sh <pack dir>
set -euo pipefail
src=${1:?pack dir}
out=apps/web/public/art/stickers
tmp=$(mktemp -d)
mkdir -p "$out"
for f in "$src"/*.webm; do
  n=$(basename "$f" .webm)
  fps=$(ffprobe -v error -select_streams v -show_entries stream=r_frame_rate -of csv=p=0 "$f" | awk -F/ '{printf "%d", $1/$2}')
  rm -f "$tmp"/*.png
  # The libvpx decoder keeps the alpha channel (the built-in one drops it).
  ffmpeg -v error -c:v libvpx-vp9 -i "$f" -vf "scale=224:224:flags=lanczos,format=rgba" "$tmp/%03d.png"
  frames=("$tmp"/*.png)
  if [ ${#frames[@]} -eq 1 ]; then
    cwebp -quiet -q 85 -alpha_q 100 "${frames[0]}" -o "$out/$n.webp"
  else
    img2webp -loop 0 -lossy -q 80 -m 5 -d $((1000 / fps)) "${frames[@]}" -o "$out/$n.webp" >/dev/null
  fi
  # The picker's still: the middle frame, small.
  mid=${frames[$(( ${#frames[@]} / 2 ))]}
  cwebp -quiet -q 80 -alpha_q 90 -resize 112 112 "$mid" -o "$out/$n-s.webp"
done
rm -rf "$tmp"
echo "$(ls "$out" | wc -l) files, $(du -sh "$out" | cut -f1)"
