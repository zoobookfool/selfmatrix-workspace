# M1 step 1 受け入れレビュー: 実 ClientWidgetApi トランスポート実証 (Claude 実装分)

レビュアー: Claude。方式: **多視点並列レビュー (設計適合 / セキュリティ / テスト健全性) + 変異バッテリー
6 種の逐次実測** (multi-agent workflow)。実装も Claude (サブエージェント) のため、レビューは実装とは
独立のエージェント群 + レビュアー本人の独立再実行で行った。2026-07-07。

## 判定: **条件付き差し戻し → 即日修正 → 受け入れ**

初回実装は設計 (design/native-widget-transport.md §2.1) に忠実で、実 EC dist との本物のハンドシェイク
(supported_api_versions 14 件 / capabilities 要求 53 承認 53 / content_loaded ack) を証跡化できていた。
しかし変異バッテリーで **1 種のすり抜け**が出たため must-fix 5 件 (F1〜F5) を差し戻し、修正後に
全変異検知 + 全テスト green を確認して受け入れた。

## 変異バッテリー結果 (修正前 → 修正後)

| 変異 | 内容 | 修正前 | 修正後 |
| --- | --- | --- | --- |
| a | iframe シムの postMessage 無効化 | 検知 | — |
| b | main の to-view 転送破壊 | 検知 | — |
| c | driver の capability 承認を空に | 検知 | — |
| **d** | **from-view の検証 (validateWidgetBridgeMessage) バイパス** | **すり抜け (両 npm test green)** | **検知 (exit 1、spoofRejected:false / spoofLeaked:true)** |
| e | shell preload の折り返し削除 | 検知 | — |
| f | call view preload の配送削除 | 検知 (両スイート) | — |

変異 d の再実測はレビュアー本人が実施 (バックアップ + Edit → FAIL 確認 → cmp でバイト同一復元)。

## must-fix と対応 (F1〜F5、全対応済み)

1. **[critical] 検証バイパスがテスト不可視** (M0 の「実経路を通らないテスト」と同型の再発) —
   smoke は正規メッセージしか流さず、`rejectedMessageCount` が pass 判定に未使用だった。
   → **F1**: smoke がハンドシェイク後に widgetId 不一致のスプーフ (`selfmatrix.test.spoof`) を
   EC window に注入し、`spoofRejected && !spoofLeaked && unexpectedRejectedCount===0` を
   pass 条件に追加 (誤拒否リグレッションも同時に検知)
2. **[major] to-view 方向 (shell→EC) が無検証素通し**で、同一オリジン iframe (prototype は cinny を
   iframe 埋め込み) から `window.parent.selfmatrixNative` 経由で偽メッセージを注入できる —
   → **F2a**: `validateToViewMessage` 純関数を新設し main で適用 (CLI シナリオ
   to-view-widget-id-mismatch 追加)。**F2b**: 送信 API を `claimWidgetTransport()` の claim-once に
   変更し、二重 claim が throw することを smoke で確認 (`claimGuard` を pass 条件に)。
   本番 topology (cinny がトップフレーム) では前提が変わるため **M2 監査に引き継ぎ**
   (design/native-widget-transport.md「残存リスク」節)
3. **[minor] ツールバー操作の 10 秒無音退行** (M0 の sendWidgetAction が内包していた
   ensureCallView が消えた) — → **F3**: sendAction が送信前に ensureCallView を await
4. **[minor] echo 現象の無害性が未記録** — call view preload は自分の postMessage も拾って
   from-view として再転送する。matrix-widget-api の PostmessageTransport が方向フィルタ +
   requestId 照合で必ず握り潰すことを**ライブラリ実コードの精読で確認** (無限ループ・誤応答なし)。
   CLI がこの loopback を観測点に使うため**抑制してはならない** — → **F4**: コメントで明記
5. **[minor] CLI の from-view チャンネル名が文字列検証されていない非対称** — → **F5**:
   `unexpected_ipc_channel` reason で明示検証

## 受け入れ時の確認 (レビュアー独立実行)

- native-prototype `npm test` (smoke + memory): exit 0
- test-harness `npm test`: exit 0 (CLI 9 シナリオ + web static、全 PASS)
- handshake-result.json: pass:true / spoofRejected:true / unexpectedRejectedCount:0 /
  claimGuard:true / rejectedMessageCount:1 (=注入スプーフのみ)
- 秘匿情報スイープ (mesugaki / IP / devpass / 個人パス): クリーン

## 記録事項 (差し戻し対象外)

- **設計適合は全項目一致**: 素通しルータ化 (responseForWidgetRequest はライブ経路から除去)、
  シム形状、waitForIframeLoad:false、チャンネル名の全ファイル一貫、widgetHostReady ゲーティングは
  タイムアウト時に偽 PASS せず fail 側に倒れる
- **host 発の toWidget `io.element.join` に EC は応答しない** (設計 §1.4 どおり join は本来
  widget→host 方向)。step 3 で実 cinny の join 導線に置き換わるため実害なし
- to-view 系証跡は「host が送った」記録であり受信証明ではない (受信は capabilities reply 到達で
  担保、コメント明記済み)
- shell ウィンドウ sandbox:false は M0 から不変だが、ページ script で ClientWidgetApi を動かす
  step 1 の構成で意味が重くなった → M2 で sandbox:true 化または構成見直し (残存リスク節)
