#!/usr/bin/env bash
# Store assets for Google Play (reproducible, no design tool needed).
#
#   bash scripts/make-store-assets.sh
#
# Produces:
#   store/icon-512.png        512x512, 8-bit, no alpha   (Play: hi-res icon)
#   store/feature-graphic.png 1024x500, 8-bit, no alpha   (Play: feature graphic)
#   store/screenshots/shot-N.png   1080x1920 (only if store/screenshots-src/ has images)
#
# Note: the sandbox has no Arabic font and no text-shaping stack (no Pango/HarfBuzz),
# so the banner text is English here. Arabic banner text must be exported from a tool
# with shaping (Figma / Inkscape / Canva) and dropped in as store/feature-graphic.png.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p store

PNGOPT=(-depth 8 -strip -define png:compression-level=9 -define png:compression-filter=5)
ICON=public/icons/icon-512.png
[ -f "$ICON" ] || { echo "missing $ICON — run scripts/make-icons.sh first"; exit 1; }

# ---- 1) hi-res icon: Play rejects icons with an alpha channel ----
convert "$ICON" -resize 512x512 -background '#050c1a' -alpha remove -alpha off "${PNGOPT[@]}" store/icon-512.png

# ---- 2) feature graphic 1024x500 ----
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# navy base + three light blooms (same identity as the app splash)
convert -size 1024x500 gradient:'#0b2f7a-#04080f' \
  \( -size 1024x500 xc:none -fill '#1b6dff' -draw 'circle 120,520 120,240' -blur 0x130 \) -compose over -composite \
  \( -size 1024x500 xc:none -fill '#22d3ee' -draw 'circle 980,10 980,-200' -blur 0x120 \) -compose over -composite \
  \( -size 1024x500 xc:none -fill '#67e8f9' -draw 'circle 880,90 880,20' -blur 0x70 \) -compose over -composite \
  "$WORK/base.png"

# app icon on the left, floating with a soft shadow and a hairline ring
convert "$ICON" -resize 264x264 "$WORK/icon.png"
convert -size 1024x500 xc:none \
  \( "$WORK/icon.png" -background none -gravity center -extent 300x300 \) \
  -gravity west -geometry +64+0 -compose over -composite \
  "$WORK/icon-placed.png"
convert "$WORK/icon-placed.png" -channel A -blur 0x18 -level 0,55% +channel \
  -background 'rgba(0,0,0,0.55)' -gravity west -geometry +64+14 -compose over \
  "$WORK/shadow.png"
convert "$WORK/base.png" "$WORK/shadow.png" -compose over -composite "$WORK/stage1.png"
convert "$WORK/stage1.png" "$WORK/icon-placed.png" -compose over -composite "$WORK/stage2.png"

# ECG pulse under the wordmark (echoes the logo's capsule pulse)
convert -size 1024x500 xc:none -stroke 'rgba(103,232,249,0.85)' -strokewidth 5 -fill none \
  -draw 'stroke-linecap round stroke-linejoin round polyline 466,404 560,404 592,368 634,438 668,404 916,404' \
  "$WORK/pulse.png"
convert "$WORK/stage2.png" "$WORK/pulse.png" -compose over -composite "$WORK/stage3.png"

# wordmark + tagline (DejaVu Sans Bold ships with the runner)
convert "$WORK/stage3.png" \
  -font DejaVu-Sans-Bold -fill white -pointsize 104 -annotate +466+250 'MDA' \
  -font DejaVu-Sans -fill '#9fd8ff' -pointsize 40 -annotate +470+306 'MedicineData' \
  -font DejaVu-Sans -fill 'rgba(226,240,255,0.78)' -pointsize 18 \
  -annotate +470+350 'Pharmaceutical reference - Yemen & Arab world' \
  -alpha remove -alpha off "${PNGOPT[@]}" store/feature-graphic.png

# ---- 3) optional: frame real phone screenshots (1080x1920, no alpha) ----
# Drop raw captures in store/screenshots-src/ (any size) and re-run. Play accepts the raw
# captures too; framing is only for a consistent listing. Captions are English because the
# generator has no Arabic shaping; the screenshot pixels themselves are untouched.
if compgen -G "store/screenshots-src/*.png" > /dev/null || compgen -G "store/screenshots-src/*.jpg" > /dev/null; then
  mkdir -p store/screenshots
  rm -f store/screenshots/*.png
  n=0
  for src in $(ls store/screenshots-src/*.png store/screenshots-src/*.jpg 2>/dev/null | sort); do
    n=$((n+1))
    # fill 1000x1560 (a hair of the top/bottom is cropped, the UI stays centred)
    convert "$src" -resize '1000x1560^' -gravity center -extent 1000x1560 "$WORK/shot.png"
    # rounded phone corners (cosmetic): a white round-rect used as the alpha mask
    convert -size 1000x1560 xc:none -fill white -draw 'roundrectangle 0,0 999,1559 46,46' "$WORK/mask.png"
    convert "$WORK/shot.png" "$WORK/mask.png" -alpha off -compose CopyOpacity -composite "$WORK/shot-round.png"
    convert -size 1080x1920 gradient:'#0b2f7a-#04080f' \
      \( -size 1080x1920 xc:none -fill '#1b6dff' -draw 'circle 100,1880 100,1520' -blur 0x150 \) -compose over -composite \
      \( -size 1080x1920 xc:none -fill '#22d3ee' -draw 'circle 1040,60 1040,-260' -blur 0x140 \) -compose over -composite \
      -gravity center "$WORK/shot-round.png" -compose over -composite \
      -alpha remove -alpha off "${PNGOPT[@]}" "store/screenshots/shot-$n.png"
    identify -format '%f %wx%h %b\n' "store/screenshots/shot-$n.png"
  done
  echo "framed $n screenshot(s) -> store/screenshots/"
fi

echo "store assets:"
identify -format '%f  %wx%h  %[colorspace]  %b\n' store/icon-512.png store/feature-graphic.png
# Play requirements: icon exactly 512x512, feature graphic exactly 1024x500, no alpha
python3 - <<'PY'
import struct, sys
def info(path):
    with open(path,'rb') as f: b=f.read(33)
    w,h = struct.unpack('>II', b[16:24])
    bit_depth, color_type = b[24], b[25]
    return w,h,bit_depth,color_type
ok = True
for path, want in (('store/icon-512.png',(512,512)), ('store/feature-graphic.png',(1024,500))):
    w,h,d,ct = info(path)
    alpha = ct in (4,6)
    good = (w,h)==want and d==8 and not alpha
    ok &= good
    print(f"{path}: {w}x{h} {d}-bit colorType={ct} alpha={alpha} -> {'OK' if good else 'FAIL'}")
sys.exit(0 if ok else 1)
PY
