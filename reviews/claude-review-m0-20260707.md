# M0 受け入れレビュー: プロトタイプ堅牢化 (workspace 9b45b6b、GPT 作)

レビュアー: Claude。方式: diff 精読 + **実行検証 + 変異テスト** (実装を意図的に壊して npm test が
落ちるかを 4 パターン実測。各変異は検証後に完全復元済み)。2026-07-07。

## 判定: **差し戻し (受け入れ NG)**

must-fix 5 件中 4 件は本物の実装で対応されており土台は良い。しかし M0 の受け入れ条件
「`npm test` が実装の回帰を実際に検知できる」を変異テストで検証した結果、**2 種の破壊が
どのテストにも検知されず green のまま**だった。受け入れ基準 (1 つでもすり抜けたら NG) により差し戻し。

## 確認できたこと (再作業不要)

- **CLI のトートロジー解消は本物**: `createRequire` で main.cjs を実際に import、preload 実ファイルを
  `vm.runInNewContext` で実行。unknown action の仕様は「エラー応答」側へ一本化済み
- origin / widgetId 検証・同一オリジン assert・callView `sandbox:true` は実装済みで動作
- evidence JSON はコミット化され、**smoke 再実行の結果がコミット済み evidence と完全一致**
  (loadCount=1 / unloads=0 / dataChannelState=open)。個人パス等のサニタイズも確認
- design/native-client-decision.md への session partition 残タスク追記、test-harness.md の
  stale リスト更新も確認。秘匿情報の混入なし

## 差し戻し理由 (must-fix)

1. **[critical] 既知 action の応答ロジックを壊してもテストが green のまま** —
   `responseForWidgetRequest()` の `content_loaded` をエラー分岐に落とす変異を入れても、
   test-harness `npm test` (6 シナリオ) も native-prototype `npm run smoke` も PASS のまま。
   原因: PASS 判定が「action が出現したか」しか見ておらず、**応答内容 (成功/エラー) を
   検証していない** (`expectedErrorAction` 未設定なら常に真)。
   → 各シナリオで応答 payload の期待値 (成功/エラーの別、エラー文言) まで検証すること
2. **[critical] `assertSameOrigin` の実呼び出しを削除しても検知されない** —
   `ecUrl()` 内の assert 行を消しても全テスト green。原因: CLI の origin-mismatch シナリオは
   **関数を直接呼んでいるだけ**で、実際の呼び出し経路 (ecUrl) を通っていない。かつ prototype は
   常に同一オリジン配信なので assert 無しでも挙動差が出ない。
   → ecUrl() 経由で不一致 URL を与えて例外になることを検証するテストに変える
3. **[major] origin/widgetId 検証が `sourceIsSelf` を捨てている** — preload が計算して渡している
   送信元同一性 (`event.source === window`) を main 側が読んでいない。同一オリジン内の別フレームや
   devtools からの postMessage で origin/widgetId を詐称すれば通過できる。検証の必須条件に含めること
4. **[major] memory probe の pass 判定が bridge の生死を見ていない** — `content_loaded` 到達を
   待つが結果を判定に使っておらず、widget bridge が壊れていても pass:true になり得る弱い証跡。
   runSmoke() と同様に `sawContentLoaded` を pass 条件へ
5. **[major] native-prototype に `npm test` が無い** — 検証コマンドの型 (両ディレクトリで npm test)
   に応えられない。最低限 smoke+memory を束ねる test スクリプトを定義
6. **[minor] 記載場所の不一致 2 件**: #47247/#44652 の再現有無クローズが m0-summary.md にだけあり
   指定先の spikes/desktop-window-spike.md に無い / README への同一オリジン assert の明文化漏れ

## 次点 (M1 前に対応推奨、差し戻し必須ではない)

- main.cjs の純関数群 (WIDGET_ID / assertSameOrigin / responseForWidgetRequest 等) を
  electron 非依存の別ファイルへ分離 (M2 の selfmatrix-desktop 切り出し耐性。現状の
  try/catch シム + if(app) 分岐の同居は force fit)
- test-harness.md の「Playwright PASS」主張に一次証跡が無い (npm test の集約に test:web が
  含まれておらず、レポートも未コミット) — 実行して証跡を残すか、主張を落とすか
- validateWidgetBridgeMessage の拒否理由記録が先勝ち 1 件のみ (調査性)

## 検証メモ

- 変異 4 種: (a) 応答ロジック破壊 → **すり抜け** / (b) origin 検証無効化 → 検知 OK /
  (c) widgetId 検証無効化 → 検知 OK / (d) assert 実呼び出し除去 → **すり抜け**
- 変異はすべて git checkout -- で復元済み。最終 git status クリーン
