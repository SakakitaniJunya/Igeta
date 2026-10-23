# Fastfile に貼る lane。raw 撮影 → リポジトリの sync/export/check まで一発で回す。
# usage: fastlane screenshots

desc "Capture store screenshots (raw) then compose via store-screenshots pipeline"
lane :screenshots do
  # 1. XCUITest + snapshot() で raw を撮る（出力先は Snapfile の output_directory）
  capture_ios_screenshots

  # 2. fastlane の出力構造をパイプラインの入力構造へ正規化してから make へ渡す。
  #    snapshot は <output>/<language>/<NN>-<scenario>.png の形で出るので
  #    store/screenshots_raw/iphone/<editor-locale>/<NN>.png に並べ直す。
  sh "../scripts/normalize-fastlane-output.sh" rescue UI.important("normalize step: arrange raw PNGs manually")
end
