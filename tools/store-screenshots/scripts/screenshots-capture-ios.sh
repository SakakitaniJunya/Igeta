#!/usr/bin/env bash
# iOS シミュレータで raw スクリーンショットを撮る（macOS 専用）。
#
# 前提:
#   - macOS + Xcode (xcrun simctl)
#   - maestro: curl -Ls "https://get.maestro.mobile.dev" | bash
#   - 撮影用ビルドをシミュレータにインストール済み:
#       cd $APP_DIR && npx expo run:ios --device "iPhone 16 Pro Max"
#     （__DEV__ ビルドでのみ screenshot 引数が有効）
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)

# TODO: Maestro フローを置いたアプリのディレクトリ
APP_DIR="${APP_DIR:-mobile/app}"

read_json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s)$1))"; }
DEVICE_NAME=$(node -e "import('$ROOT/scripts/locales.mjs').then(m=>console.log(m.CAPTURE_TARGETS.ios.simulator))")
APP_ID=$(node -e "import('$ROOT/scripts/locales.mjs').then(m=>console.log(m.CAPTURE_TARGETS.ios.appId))")
DEVICE_KEY=$(node -e "import('$ROOT/scripts/locales.mjs').then(m=>console.log(m.CAPTURE_TARGETS.ios.device))")

booted_udid() {
  xcrun simctl list devices booted -j | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);for(const ds of Object.values(j.devices)){const f=(ds||[]).find(d=>d.isAvailable);if(f){console.log(f.udid);return}}})"
}

UDID=$(booted_udid)
if [ -z "$UDID" ]; then
  xcrun simctl boot "$DEVICE_NAME" 2>/dev/null || true
  sleep 8
  UDID=$(booted_udid)
fi
[ -n "$UDID" ] || { echo "no booted simulator ($DEVICE_NAME)" >&2; exit 1; }

# ライトモード + ステータスバー固定（時刻・電波・電池）
xcrun simctl ui "$UDID" appearance light
xcrun simctl status_bar "$UDID" override \
  --time "9:41" --batteryState charged --batteryLevel 100 \
  --cellularMode active --cellularBars 4 --wifiBars 3 --wifiMode active

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
