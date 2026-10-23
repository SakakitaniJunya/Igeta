#!/usr/bin/env bash
# Android エミュレータで raw スクリーンショットを撮る（macOS/Linux 両対応）。
#
# 前提:
#   - adb + 起動済みエミュレータ
#   - maestro: curl -Ls "https://get.maestro.mobile.dev" | bash
#   - 撮影用ビルドをインストール済み:
#       cd $APP_DIR && npx expo run:android
#     （__DEV__ ビルドでのみ screenshot 引数が有効）
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

# TODO: Maestro フローを置いたアプリのディレクトリ
APP_DIR="${APP_DIR:-mobile/app}"

APP_ID=$(node -e "import('$ROOT/scripts/locales.mjs').then(m=>console.log(m.CAPTURE_TARGETS.android.appId))")
DEVICE_KEY=$(node -e "import('$ROOT/scripts/locales.mjs').then(m=>console.log(m.CAPTURE_TARGETS.android.device))")

adb devices | grep -q "device$" || { echo "no android device/emulator" >&2; exit 1; }

# ステータスバーをデモモードで固定（9:41・フル充電・フル電波）
adb shell settings put global sysui_demo_allowed 1 >/dev/null 2>&1 || true
adb shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null 2>&1 || true
for e in "clock -e hhmm 0941" "battery -e level 100 -e plugged false" "network -e wifi show -e level 4" "status -e volume none -e bluetooth none -e location false -e alarm false -e sync false -e tty false -e eri false -e mute false -e speakerphone false"; do
  adb shell am broadcast -a com.android.systemui.demo -e command $e >/dev/null 2>&1 || true
done

OUT_BASE="$ROOT/store/screenshots_raw/$DEVICE_KEY"
mkdir -p "$OUT_BASE"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

FAILED=0
while read -r EDITOR SNAP ASC; do
  mkdir -p "$OUT_BASE/$EDITOR"
  while read -r NN SCENARIO ANCHOR; do
    echo "=== capture $DEVICE_KEY/$EDITOR/$NN scenario=$SCENARIO"
    RUN_DIR="$WORKDIR/run-${EDITOR}-${NN}"
    mkdir -p "$RUN_DIR"
    set +e
    (cd "$RUN_DIR" && maestro test \
      -e APP_ID="$APP_ID" -e SCENARIO="$SCENARIO" -e ANCHOR="$ANCHOR" -e OUT="$NN" \
      -e APPLE_LANG="($SNAP)" -e APPLE_LOCALE="$SNAP" \
      "$ROOT/$APP_DIR/.maestro/screenshot.yaml")
    RC=$?
    set -e
    FOUND=$(find "$RUN_DIR" -name '*.png' | head -1)
    if [ $RC -ne 0 ] || [ -z "$FOUND" ]; then
      echo "  FAILED: $SCENARIO (maestro rc=$RC)" >&2
      FAILED=1
      continue
    fi
    mv "$FOUND" "$OUT_BASE/$EDITOR/$NN.png"
    echo "  -> store/screenshots_raw/$DEVICE_KEY/$EDITOR/$NN.png"
  done < <(node scripts/list-screenshot-plan.mjs plan)
done < <(node scripts/list-screenshot-plan.mjs locales)

echo "done. raw screenshots under store/screenshots_raw/$DEVICE_KEY"
[ $FAILED -eq 0 ]
