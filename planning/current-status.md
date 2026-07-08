# Current Status (2026-07-08)

**状態: 現在地の正本。** 長い履歴は [roadmap.md](roadmap.md) に残し、今どこまで進んだか・次に何を見るかをここにまとめる。

## 最新 (2026-07-08): ネイティブ化 M1 完了・案 B 正式 GO・M2 開始

- **M1 (通話コアの技術成立) 完了**。cinny fork `spike/native-shell` + workspace `native-prototype` で、
  実 dev バックエンドに対し **2 ユーザー通話 + 配信 + 無再接続の窓移動 3 往復** の E2E が PASS
  (レビュアー独立再実行込み)。matrix-widget-api は無改造。bounds 同期 (実 UI でのビデオ位置追従 ≤1px) と
  7 語彙の production 配線検証 (realClickVocabulary) も完了。正本は [native-milestones.md](native-milestones.md)、
  設計は [native-widget-transport.md](../design/native-widget-transport.md)。
- **案 B (WebContentsView 再親子付け) は 2026-07-08 に運用者が正式 GO を承認**。
- **web/native 併走を決定** (2026-07-08)。web は撤収せず 2 系統で定常運用。運用ルールの正本は
  [web-native-parallel.md](web-native-parallel.md) (1 コードベース 2 ビルド、新機能は共通コードに置けば両方に乗る)。
- **M2 開始済み**: 製品リポジトリ [selfmatrix-desktop](https://github.com/zoobookfool/selfmatrix-desktop) を新設し
  native-prototype から卒業 (workspace の native-prototype はアーカイブ = コード凍結)。

## 現在の到達点

- SelfMatrix は Synapse + PostgreSQL + Cinny fork + Element Call fork + LiveKit SFU の構成で稼働済み。
- UI 仕様の正本は [ui-design-notes.md](../design/ui-design-notes.md) v1.5。見た目合わせの視覚基準は [mocks/ui-mock.html](../design/mocks/ui-mock.html) v2.2。
  モック v2.2 は v1.4 時点の内容を含むため、v1.5 の追加仕様と衝突する場合は ui-design-notes を優先する。
- 通話 UI は画面共有特化、視聴オプトイン、画質/FPS ピッカー、話者オーバーレイ、配信タイル音量調整、RNNoise ノイズ抑制まで実装済み。
  話者オーバーレイ右クリックからのユーザー単位音量調整は未実装扱いで、[backlog.md](backlog.md) を正とする。
- 別ウィンドウ通話開始モードは web 版 [call-window-mode.md](../design/call-window-mode.md) の履歴 (web 版フォールバック専用)。
  ネイティブ版は M3 で Discord 準拠の無再接続ポップアウトへ (call-window-mode の UX 案は M1 NO-GO 時のみ復活)。

## 次にやること (M2 の製品化タスク。native-milestones.md M2 節が正本)

1. **[MUST] web ビルドの native 分岐無効化 (tree-shake)** — 併走の安全性の要。web 本番は現状未対処。
2. **[MUST] mainWindow のナビゲーション封じ込め監査 + shell の API 露出面整理** (GPT M2 readiness レビュー対応中)。
3. homeserver 選択制、画面共有ソース選択 UI + system audio トグル、トレイ常駐、About/AGPL。
4. リリース CI (electron-builder → Releases) + minisign 更新検証 + SmartScreen 手順書。

### 並行検討 (M2 とは独立)

- **ユーザーカスタム機構** ([user-customization.md](../design/user-customization.md)、ドラフト): プラグイン (サンドボックス型) /
  テーマ (トークンのみ確定) / 音声フィルタ。運用者回答 4 問反映済み、GPT レビュー待ち。
- **アプリ単位音声**: OBS (WASAPI プロセスループバック) 参考の再調査済み ([app-audio-capture-spike.md](../spikes/app-audio-capture-spike.md))。
  技術リスクは低いが工数中。**M2 MUST にはせず M3 以降の独立項目**が推奨。

## 直近の未完了

未完了・保留・検証待ちは [backlog.md](backlog.md) を正とする。主なもの:

- M2 の製品化タスク一式 (上記)
- グリッド配信タイルのストリーム単体ポップアウト `🗗`
- 話者オーバーレイ右クリックからのユーザー単位音量調整
- SFU 切断時の自動再参加
- 4K60 x 3 本 + 10 人相当の負荷・品質検証
- RNNoise 既定 ON の聴感評価
- ネイティブ版の外部ミュート制御 (Stream Deck 等 / obs-websocket 風 API は user-customization で検討)

## 読み順

新しい AI / 人に渡す場合は、次の順で読むと迷いにくい。

1. [README.md](../README.md)
2. [requirements.md](requirements.md)
3. この文書
4. [native-milestones.md](native-milestones.md) (ネイティブ版の現況)
5. [ui-design-notes.md](../design/ui-design-notes.md)
6. [backlog.md](backlog.md)
7. 必要に応じて [roadmap.md](roadmap.md) と [reviews/README.md](../reviews/README.md)
