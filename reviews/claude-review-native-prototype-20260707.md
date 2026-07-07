# レビュー: ネイティブ化スパイク実測 + プロトタイプ (workspace f7d0e4b..beb7d85、GPT 作)

レビュアー: Claude。方式: 文書精読 + コード精読 (matrix-widget-api 実ソースとの突き合わせ) +
**同一環境 (Electron 43.0.0、実 cinny/EC dist) での独立再現実行**。2026-07-07。

## 結論

**技術クレームは本物。案 B (WebContentsView 分離) の中核仮説は成立する** — レビュアー自身が
committed コード (test-harness/electron-smoke、native-prototype) を再実行し、以下を独立確認した:

- WebContentsView の窓間再親子付けで `loadCount=1`・`unloads=0`・`render-process-gone` 0 件・
  **WebRTC data channel が open のまま維持**
- 実 EC bundle が WebContentsView 上で boot し、Widget API 疎通
  (supported_api_versions / content_loaded / io.element.device_mute / io.element.join を観測)
- `window.parent` 問題は「WebContentsView では `window.parent === window` になり自己ループバックする」
  性質 + preload/IPC 中継で解決 — matrix-widget-api の実装 (PostmessageTransport) と整合することを
  ソースレベルで確認
- displayMedia + **Windows の loopback (システム音声) が動作** — 音付き配信の道が開けた

捏造・過大主張 (実行していないのに実測済みと書く類) は無し。「条件付き GO / production GO ではない」
という自己評価も誠実。**ただし GO 判断の根拠の一部に実効性の無い検証が混ざっており (下記 must-fix 1)、
検証体制と証跡の保存に穴がある。**

## must-fix (次段階に進む前に)

1. **[critical] test-harness/cli/widget-protocol.mjs がトートロジー** — 実装 (main.cjs /
   widget-bridge-preload.cjs) を一切呼ばず、自前スタブと自前期待値を突き合わせているだけ。
   しかも unknown action の既定応答が実装 ({} = 無条件成功) と CLI (error 応答) で既に食い違っている。
   これを native-client-decision.md が「Widget protocol 回帰 PASS」として GO 根拠に引用しているのは
   検証能力の過大表示。**実装コードを import/起動して検証する形に作り直すこと**
2. **[major] origin / widgetId 検証が実装に無い** — bridge preload は event.origin を IPC に載せるが
   main.cjs は一度も参照しない。「origin mismatch で fail fast」は CLI 上の幻。実装側に検証を入れる
3. **[major] 同一オリジン前提の assertion 化** — window.parent ループバックは
   `new URL(parentUrl).origin === 配信 origin` が唯一の担保。起動時 assert として明文化 (README にも)
4. **[major] callView の sandbox:false** — 実コンテンツを載せる view だけ sandbox が無効。
   preload は ipcRenderer/contextBridge しか使っておらず true で動くはず。true に倒すか理由をコメントで残す
5. **[major] 証跡の保存** — evidence/ が .gitkeep のみで、decision の「合格根拠」表が引用する数値
   (loadCount=1 等) の一次成果物が未コミット。初回実測 (phase1〜3) のプローブコードも
   どこにも保存されていない (spike 方針「一時 repo / spike ブランチに置く」と矛盾)。
   evidence JSON はコミットする運用に変える (機微情報は含まれない)

## minor

- Phase 1 の「PASS」は合格条件 4 項目中 2 項目 (did-fail-load / render-process-gone) を計測せずに
  宣言されていた (後発の reparent-probe では改善済み — レビュアー再実行で 0 件を確認)
- 事前指摘の Electron 既知バグ #47247/#44652 の再現有無が明示的にクローズされていない (暗黙 PASS)
- session partition / localStorage 契約の実機確認が decision の残タスク一覧から抜けている
  (spike 本文では「次の prototype 合格条件に残す」と申告済み — decision 側にも載せること)
- 約束されていたメモリ 3 点実測 (シェルのみ/通話中/配信視聴中×2) が未実施のまま
- design/test-harness.md 末尾の「未実施」リストが stale (他文書の PASS 記述と矛盾)
- 実測記録の Node バージョン表記ゆれ (24.18.0 vs JSON 内 24.17.0)

## 残る本丸 (decision 自身も認めている未検証)

**cinny の実 ClientWidgetApi / CallWidgetDriver 統合**。実運用の host 側は `iframe.contentWindow` を
必須とするため WebContentsView にそのまま繋げず、main.cjs は 5 アクションの簡易スタブで代替している。
NativeWidgetTransport / NativeCallHost 相当のアダプタの実現性が、実 LiveKit join・共有中 view 移動・
system audio・session/localStorage 共有と並ぶ次段階の合格条件。

## ガバナンス (運用者確認待ち)

README の文書配置ルールに「prototype / test harness は workspace に置く」が追記された。
実務上は合理的な拡張だが、「docs 専用だったリポジトリに実行可能コードを置く」判断であり、
既存の決定記録と同水準の運用者サインオフが無い。運用者の明示承認を得て決定記録化するべき。

## 良かった点

- 中核仮説の検証設計と解決アイデア (window.parent 自己ループバック + IPC 中継) は的確で、実コードで成立
- Electron 43.0.0 固定 + package-lock コミットで再現性を確保 (レビュアーの独立再現が実際に成功した)
- electron-smoke の probe 2 種は本物の RTCPeerConnection / desktopCapturer を叩く正当な検証
- 「条件付き GO」の自己評価は誠実で、未検証事項の大半は自己申告されている
