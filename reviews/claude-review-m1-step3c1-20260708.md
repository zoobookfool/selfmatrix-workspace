# M1 step 3c-1 受け入れレビュー: 実ログイン → 実 LiveKit join E2E (Claude 実装分)

レビュアー: Claude。方式: レビュアー本人による **E2E 独立再実行** + 2 視点並列レビュー
(widgetId 導出のセキュリティ / E2E 健全性・回帰)。2026-07-08。

## 判定: **受け入れ** (minor 2 + info 1 をレビュアーが直接修正の上)

## 実証されたこと (M1 の中核)

実 dev バックエンド (synapse.m.localhost + MatrixRTC/LiveKit) に対し、Playwright の Electron
ドライバで prototype を `--cinny-shell` (cinny トップフレーム = 本番 topology) 起動し、
**cinny の実 UI ログイン (alice) → Voice Lounge → 参加 → NativeCallEmbed 経路 → EC が
WebContentsView 内で実 LiveKit 接続確立**まで全自動で PASS:

- `bridgeDetected` / `realJoinObserved` (widget 発 `io.element.join`、echo 誤検知でないことを
  レビューで別途確認) / `inCallUi` / `livekitConnected` (dom-ready 注入の RTCPeerConnection
  ラッパで connectionState "connected" を実測) — 4 条件全達成
- **レビュアーが独立再実行しても PASS** (evidence: native-join-result.json + PNG 2 枚)

## 実バックエンドで発覚したシェル実バグ 4 件 (バックエンド無しの smoke では不可視だった)

1. 静的サーバに `.wasm` MIME が無く rust-crypto の WASM ロードが失敗 → 起動画面で永久停止
2. `/cinny/` プレフィクス配信が cinny のルータ basename と不整合 → cinny-shell モードは
   origin root 配信に変更
3. cinny の root 相対アセット (`/assets/*` 等) の 404 → root fallback 追加 (EC の 2 base を
   shadow しないガード付き、パストラバーサル防御は既存 resolveStatic を適用 — レビューで確認)
4. widget bridge 検証が合成 WIDGET_ID 固定で **cinny の実 widgetId ("call-embed") を全拒否**
   → 検証済み openCallView URL 由来の per-call 値 (`state.activeWidgetId`) に変更

## レビュー指摘と対応 (レビュアーが直接修正)

1. **[minor] widgetId 照合の未アクティブ時フォールバックが fail-open** (`?? WIDGET_ID`) —
   現状悪用経路は無いが将来の変更で静かな抜け穴になり得る。→ 未アクティブ (null) 時は照合せず
   `no_active_call` で必ず拒否する fail-closed に変更
2. **[info] URL の widgetId 値そのものが未検証** (低信頼側が書いた値を同じ低信頼側発メッセージの
   照合期待値に使うトートロジー) — → `validateCallViewUrl` に allow-list
   (`KNOWN_WIDGET_IDS` = prototype 合成 ID + "call-embed") を追加
3. **[minor] README の「3 つの実バグ」が実際は 4 件** — 修正

修正後、npm test (3 ゲート) / test-harness / **E2E 再実行** すべて green を確認。

## レビューで問題なしと確認できたこと

- `--e2e-real-join` フラグゲーティング: ignore-certificate-errors / fake media /
  host-resolver-rules / RTC ラッパ / `__selfmatrixE2E` は全てフラグ配下のみで、通常起動・
  smoke には不適用
- E2E の pass 判定は 4 条件の論理積で、タイムアウト・例外・バックエンド未稼働のいずれでも
  偽 PASS しない
- activeWidgetId は検証済み URL からのみ設定・closeCallView でリセット・stale なし
- 秘匿情報: パスワードは env のみ、evidence の access_token は redact 済み、
  個人絶対パス・実ドメインなし

## 3c 残り (M1 受け入れまで)

- **3c-2**: 2 ユーザー通話 + 配信 + **通話中の窓移動 (WebContentsView 再親子付け) 無再接続**
- **3c-3**: 7 語彙の実 in-call DOM 検証 + state push 再同期の実測
- **3c-4**: system audio + アプリ単位音声キャプチャのスパイク
