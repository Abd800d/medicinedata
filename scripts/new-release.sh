#!/usr/bin/env bash
# إنشاء إصدار جديد (وسم) → يُشغّل بناء APK/AAB موقّع تلقائيًا على GitHub Actions.
#
#   bash scripts/new-release.sh            # يزيد رقم الإصدار تلقائيًا (v1.0.4 → v1.1.0 أول مرة، ثم v1.1.1)
#   bash scripts/new-release.sh 1.2.0      # رقم صريح
#   SKIP_PUSH=1 bash scripts/new-release.sh 1.2.0   # إنشاء الوسم فقط بدون دفع
#
# ملاحظة: البناء الموقّع يتطلب أسرار التوقيع (docs/SIGNING.md).
set -euo pipefail

BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
VERSION="${1:-}"

cd "$(dirname "$0")/.."

echo "→ تحديث $REMOTE/$BRANCH …"
git fetch "$REMOTE" --tags --quiet
if [ "$(git rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]; then
  echo "! أنت على فرع $(git rev-parse --abbrev-ref HEAD) وليس $BRANCH."
  echo "  أضف التغييرات ثم:  git switch $BRANCH && git pull --ff-only"
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "! هناك تغييرات غير محفوظة. اعمل commit أولًا."
  exit 1
fi

if [ -z "$VERSION" ]; then
  LAST="$(git tag -l 'v*' --sort=-v:refname | head -1)"
  LAST="${LAST:-v1.0.0}"
  BASE="${LAST#v}"
  MAJOR="${BASE%%.*}"; REST="${BASE#*.}"; MINOR="${REST%%.*}"
  # أول إصدار موقّع يقفز إلى 1.1.x حتى لا يتعارض مع نسخ debug السابقة
  if [ "$MAJOR" = "1" ] && [ "$MINOR" = "0" ]; then
    VERSION="1.1.0"
  else
    PATCH="${REST#*.}"; PATCH="${PATCH%%[!0-9]*}"
    VERSION="$MAJOR.$MINOR.$(( ${PATCH:-0} + 1 ))"
  fi
  echo "→ آخر وسم: $LAST  ⇒  الإصدار الجديد: v$VERSION"
fi

TAG="v${VERSION#v}"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "! الوسم $TAG موجود بالفعل. اختر رقمًا آخر: bash scripts/new-release.sh 1.1.2"
  exit 1
fi

git tag -a "$TAG" -m "MDA $TAG"
echo "✓ تم إنشاء الوسم $TAG"

if [ "${SKIP_PUSH:-0}" = "1" ]; then
  echo "SKIP_PUSH=1 — لم يُدفع الوسم. للدفع يدويًا: git push $REMOTE $TAG"
  exit 0
fi

git push "$REMOTE" "$TAG"
cat <<EOF
✓ تم دفع الوسم $TAG — بدأ البناء الموقّع على GitHub Actions.

  المتابعة:   gh run watch
  النتيجة:    https://github.com/${GITHUB_REPOSITORY:-Abd800d/medicinedata}/releases/tag/$TAG
EOF
