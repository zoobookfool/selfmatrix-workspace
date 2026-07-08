# Current Status (2026-07-08)

**状態: 現在地の正本。** 長い履歴は [roadmap.md](roadmap.md) に残し、今どこまで進んだか・次に何を見るかをここにまとめる。

## 最新 (2026-07-08): ネイティブ化 M1 完了

- **M1 (通話コアの技術成立) 完了**。cinny fork `spike/native-shell` + workspace `native-prototype` で、
  実 dev バックエンドに対し **2 ユーザー通話 + 配信 + 無再接続の窓移動 3 往復** の E2E が PASS
  (レビュアー独立再実行込み)。matrix-widget-api は無改造。正本は
  [native-milestones.md](native-milestones.md)、設計は [native-widget-transport.md](../design/native-widget-transport.md)。
- **案 B (WebContentsView 再親子付け) は技術的に GO 相当**。正式 GO/NO-GO 判断・M2 着手
  (selfmatrix-desktop リポジトリ新設)・アプリ単位音声の LATER 化は**運用者の承認事項**。
- **web/native 併走を決定** (2026-07-08)。web は撤収せず 2 系統で定常運用。運用ルールの正本は
  [web-native-parallel.md](web-native-parallel.md)。
- M1 完了時点の未検証 (M2 持ち越し): bounds 同期 (実 UI でのビデオ位置追従)、web ビルドの native 分岐
  無効化 (セキュリティ MUST)、7 語彙の production 配線検証。詳細は native-milestones の M2 必須項目。

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

## 次の判断ゲート (M1 は完了。以下は運用者承認待ち)

1. **案 B 正式 GO/NO-GO** — 技術的裏付けは M1 で揃った。GO 推奨。
2. **M2 着手 = selfmatrix-desktop リポジトリ新設の承認** ([native-milestones.md](native-milestones.md) M2)。
3. **アプリ単位音声の LATER 化の承認** ([spikes/app-audio-capture-spike.md](../spikes/app-audio-capture-spike.md))。

> 旧ゲート (NativeWidgetTransport adapter / 実 join / 共有中移動 / system audio) はすべて M1 で完了済み。

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
