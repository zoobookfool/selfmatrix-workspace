# M1 step 2 受け入れレビュー: CallControl DOM 移設の単体実証 (Claude 実装分)

レビュアー: Claude。方式: 2 視点並列レビュー (設計適合+テスト健全性 / セキュリティ) +
**変異バッテリー 4 種の逐次実測** (multi-agent workflow)。実装も Claude (サブエージェント) のため
実装とは独立のエージェント群 + レビュアー本人の独立再実行で受け入れ判定。2026-07-07。

## 判定: **条件付き差し戻し → 即日修正 (F6〜F9) → 受け入れ**

## 実装の重要発見 (設計文書へ反映済み)

1. **マイク/ビデオのトグルは DOM 操作ではない**: cinny CallControl.ts の精読で、
   toggleMicrophone/toggleVideo は `call.transport.send(ElementWidgetActions.DeviceMute)` =
   カテゴリ A (widget action) と判明。**DOM RPC 移設が必要なのは
   screenshare/spotlight/grid/emphasis/reactions/settings のみ** → (B) リスクを高→中に引き下げ
2. **sandbox:true の preload は相対 require 不可** (`node:` 組み込みも `__dirname` も不可)。
   第 2 preload は `session.registerPreloadScript()` で注入する方式を確立
3. prototype はバックエンド無しのため EC は ErrorView を描画 (NativeWidgetDriver が
   readRoomState 未実装 → Room not found)。対象は ErrorView の閉じるボタンに逸脱
   (evidence の deviationsFromDesign に記録)。in-call 実コントロール適用は step 3

## 変異バッテリー結果 (全 4 種検知、修正前時点)

| 変異 | 内容 | 結果 |
| --- | --- | --- |
| g | preload の .click() を no-op 化 | 検知 (exit 1、domChanged/statePushSeen false) |
| h | main の correlationId 中継破壊 | 検知 (5s タイムアウト → rpcRoundTrip false) |
| i | MutationObserver の observe 削除 | 検知 (statePushSeen false) |
| j | state push の main 素通し破壊 | 検知 |

各変異は cp バックアップ + Edit 適用 → npm test FAIL 実測 → 復元 (cmp バイト同一) の手順。

## must-fix と対応 (F6〜F9、全対応済み)

1. **[major] pass 判定に「実クリックが EC 本体に届いた」独立シグナルが無い** —
   domChanged/statePushSeen は preload 自身が付ける合成属性の自己完結観測のため、
   将来 click() を属性直接セットに置き換える回帰が検知不能だった。
   → **F6**: invoke 後に accepted from-view として `io.element.close` (EC の React onClick が
   実際に発火した証拠) が観測されることを `realClickConfirmed` として pass 条件に AND。
   **効果はレビュアーが独立再実測**: click→属性直接セットの変異で
   rpcRoundTrip/domChanged/statePushSeen は true のまま realClickConfirmed:false → exit 1。
   ※ErrorView 対象に固有の傍証であり、step 3 で対象差し替え時に対応シグナルへ置換 (コメント明記)
2. **[major] `callControlInvoke` が claim-once 外で常時公開** — step 1 F2b が塞いだ同一オリジン
   iframe 到達経路の新チャンネルでの再発。実コントロールに差し替わると「ユーザー操作なしに
   他フレームから配信開始」の面になる。→ **F7**: claimWidgetTransport() に統合、手動ボタンは
   claim 済み shell-widget-host のラッパー経由に。残存リスク節へ追記済み
3. **[major] README の「3 変異で実測確認済み」に repo 内の裏付けが無い** (運用ルール 3 違反) —
   → **F8**: 本レビュー記録への参照に置換 (変異 4 種と適用→FAIL→復元の手順はここに記録)
4. **[minor] step 3 引き継ぎ情報の欠落** — spotlight/emphasis は `<input>` の `checked`
   **プロパティ** (属性ではない) のため属性ベース MutationObserver では拾えない
   (web 版は click 後 refreshEmphasisState() で再読込)。→ README / evidence / 設計文書 §2.2 に明記。
   セレクタ表記の脱字も修正 (F9)

## 受け入れ時の確認 (レビュアー独立実行)

- native-prototype / test-harness `npm test`: 両方 exit 0
- F6 変異再実測: 上記のとおり FAIL を確認後、cmp バイト同一で復元 → green 再確認
- call-control-result.json: pass:true / rpcRoundTrip:true / domChanged:true / statePushSeen:true /
  **realClickConfirmed:true**
- 秘匿情報スイープ: クリーン

## 記録事項 (差し戻し対象外)

- RPC のタイムアウト (5s)・view 未生成・preload 未ロードはいずれも fail 側に倒れることを確認
- main.cjs は call-control でも「解釈しない中継」を維持 (応答生成なし)
- widget-bridge-preload.cjs の差分はコメントのみで、registerPreloadScript 導入は step 1 の
  ブリッジ経路に影響なし (handshake ゲートが同時に green であることで裏付け)
