# Current Status (2026-07-07)

**状態: 現在地の正本。** 長い履歴は [roadmap.md](roadmap.md) に残し、今どこまで進んだか・次に何を見るかをここにまとめる。

## 現在の到達点

- SelfMatrix は Synapse + PostgreSQL + Cinny fork + Element Call fork + LiveKit SFU の構成で稼働済み。
- UI 仕様の正本は [ui-design-notes.md](../design/ui-design-notes.md) v1.5。見た目合わせの視覚基準は [mocks/ui-mock.html](../design/mocks/ui-mock.html) v2.2。
  モック v2.2 は v1.4 時点の内容を含むため、v1.5 の追加仕様と衝突する場合は ui-design-notes を優先する。
- 通話 UI は画面共有特化、視聴オプトイン、画質/FPS ピッカー、話者オーバーレイ、配信タイル音量調整、RNNoise ノイズ抑制まで実装済み。
  話者オーバーレイ右クリックからのユーザー単位音量調整は未実装扱いで、[backlog.md](backlog.md) を正とする。
- 別ウィンドウ通話開始モードは [call-window-mode.md](../design/call-window-mode.md) v1.4 で UI 合意済みだが、実装はネイティブ化検討の結論待ち。
- クライアントのネイティブ化は [native-client-decision.md](../design/native-client-decision.md) で **条件付き GO** と判断した。
  これは `selfmatrix-desktop` 実装着手 GO であり、production release GO ではない。release gate は実 EC + dev MatrixRTC join / 共有中移動 / 実 UI からの system audio。
- ネイティブ版の前段として、重い Electron 実機テストへ全部を押し込まないための [test-harness.md](../design/test-harness.md) を追加した。
  Web UI harness / Widget protocol CLI / Electron smoke に分け、ネイティブ固有でない不具合を先に安く落とす方針。`npm test`、Playwright UI test、Electron reparent/displayMedia smoke は PASS 済み。Widget protocol CLI は M0 で native-prototype の実装関数 + preload 実ファイルを使う形へ修正済み。
- `native-prototype/` を追加した。実 Cinny/EC の build artifact を同一 local origin で配信し、EC を `WebContentsView` として起動、Widget API bridge、別窓移動/戻し、`io.element.join` 送信まで smoke PASS。Windows loopback audio も probe PASS。M0 で origin/widgetId 検証、同一 origin assertion、call view `sandbox: true`、evidence JSON commit、メモリ 3 点測定を追加。

## 次の判断ゲート

1. `native-prototype/` に NativeWidgetTransport / NativeCallHost adapter を追加し、Cinny の iframe 前提を外す。
2. 実 EC + dev MatrixRTC で join / 共有中 view 移動 / 実 UI からの system audio を確認する。
3. 成立するなら `selfmatrix-desktop` 案 A -> 案 B を roadmap に追加し、製品リポジトリへ切り出す。成立しない、または実装コストが高すぎるなら、web 版の [call-window-mode.md](../design/call-window-mode.md) を fallback として戻す。

## 直近の未完了

未完了・保留・検証待ちは [backlog.md](backlog.md) を正とする。主なもの:

- native prototype の Cinny widget host 接続
- desktop window spike の最終 LiveKit join 検証
- グリッド配信タイルのストリーム単体ポップアウト `🗗`
- 話者オーバーレイ右クリックからのユーザー単位音量調整
- SFU 切断時の自動再参加
- 4K60 x 3 本 + 10 人相当の負荷・品質検証
- RNNoise 既定 ON の聴感評価
- ネイティブ化する場合の外部ミュート制御

## 読み順

新しい AI / 人に渡す場合は、次の順で読むと迷いにくい。

1. [README.md](../README.md)
2. [requirements.md](requirements.md)
3. この文書
4. [ui-design-notes.md](../design/ui-design-notes.md)
5. [backlog.md](backlog.md)
6. 必要に応じて [roadmap.md](roadmap.md) と [reviews/README.md](../reviews/README.md)
