#!/usr/bin/env bash
# Regenerate every app icon (web + Android) from the MDA mark.
# Usage: bash scripts/make-icons.sh
# Requires ImageMagick 6+ (`convert`). No SVG rasteriser needed — the mark is drawn
# with primitives so the result is identical on any machine.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

# 1) Midnight-blue badge: diagonal gradient + two soft light blooms (no hard seams)
convert -size 1024x1024 xc:'#0a2560' \
  \( -size 1024x1024 xc:none -fill '#1b6dff' -draw 'circle 300,1050 300,520' -blur 0x190 \) -compose over -composite \
  \( -size 1024x1024 xc:none -fill '#12a7d8' -draw 'circle 980,60 980,-330' -blur 0x170 \) -compose over -composite \
  \( -size 1024x1024 xc:none -fill '#67e8f9' -draw 'circle 900,120 900,20' -blur 0x120 \) -compose over -composite \
  "$OUT/base.png"

# 2) Capsule — two halves split down the middle, plus the ECG pulse
convert -size 760x210 xc:none \
  -fill white -draw 'roundrectangle 0,0 760,210 105,105' \
  -fill '#d8ecff' -draw 'rectangle 380,0 760,210' \
  -fill white -draw 'roundrectangle 380,0 760,210 105,105' \
  "$OUT/pill.png"
# re-clip the right half to keep the rounded cap
convert -size 760x210 xc:black -fill white -draw 'roundrectangle 0,0 759,209 105,105' "$OUT/pillmask.png"
convert "$OUT/pill.png" "$OUT/pillmask.png" -alpha off -compose CopyOpacity -composite "$OUT/pillclip.png"

convert "$OUT/pillclip.png" -resize 680x188 \
  -stroke 'rgba(11,71,184,0.22)' -strokewidth 6 -fill none -draw 'line 340,0 340,188' \
  -stroke '#0b47b8' -strokewidth 22 -fill none \
  -draw 'stroke-linecap round stroke-linejoin round polyline 96,94 190,94 232,42 286,150 330,94 376,94' \
  "$OUT/capsule.png"
convert "$OUT/capsule.png" -background none -rotate -36 -gravity center -extent 1024x1024 "$OUT/capsule-r.png"

convert "$OUT/base.png" "$OUT/capsule-r.png" -compose over -composite "$OUT/full.png"

# 3) Rounded-square mask + hairline
convert -size 1024x1024 xc:black -fill white -draw 'roundrectangle 0,0 1023,1023 286,286' "$OUT/mask.png"
convert "$OUT/full.png" "$OUT/mask.png" -alpha off -compose CopyOpacity -composite \
  -stroke 'rgba(255,255,255,0.18)' -strokewidth 10 -fill none -draw 'roundrectangle 5,5 1018,1018 282,282' \
  "$OUT/icon.png"

# 4) Round variant (Android legacy round icon)
convert -size 1024x1024 xc:black -fill white -draw 'circle 512,512 512,20' "$OUT/roundmask.png"
convert "$OUT/full.png" "$OUT/roundmask.png" -alpha off -compose CopyOpacity -composite "$OUT/icon-round.png"

# 5) Adaptive foreground: mark inside the 66% safe zone, transparent padding
convert "$OUT/icon.png" -resize 660x660 -background none -gravity center -extent 1024x1024 "$OUT/foreground.png"

# ---- Web / PWA ----
mkdir -p public/icons
convert "$OUT/icon.png" -resize 512x512 -strip public/icons/icon-512.png
convert "$OUT/icon.png" -resize 192x192 -strip public/icons/icon-192.png
convert "$OUT/icon.png" -resize 180x180 -strip public/icons/apple-touch-icon.png
convert "$OUT/icon.png" -resize 512x512 -strip public/icons/mda-icon.png
convert "$OUT/icon.png" -resize 64x64 -strip public/favicon.png

# ---- Android ----
RES=android/app/src/main/res
declare -A SIZES=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
declare -A FG=( [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )
for d in "${!SIZES[@]}"; do
  mkdir -p "$RES/mipmap-$d"
  convert "$OUT/icon.png" -resize "${SIZES[$d]}x${SIZES[$d]}" -strip "$RES/mipmap-$d/ic_launcher.png"
  convert "$OUT/icon-round.png" -resize "${SIZES[$d]}x${SIZES[$d]}" -strip "$RES/mipmap-$d/ic_launcher_round.png"
  convert "$OUT/foreground.png" -resize "${FG[$d]}x${FG[$d]}" -strip "$RES/mipmap-$d/ic_launcher_foreground.png"
done

# Splash screens (portrait/landscape) — logo on the navy background the app boots into
for f in android/app/src/main/res/drawable*/splash.png; do
  [ -e "$f" ] || continue
  size=$(identify -format '%wx%h' "$f")
  convert -size "$size" gradient:'#0a1f45-#050c1a' \
    \( "$OUT/icon.png" -resize "$(($(echo "$size" | cut -dx -f1) / 3))x" \) -gravity center -composite -strip "$f"
done

echo "icons written: public/icons/*, public/favicon.png, android/.../mipmap-*"
