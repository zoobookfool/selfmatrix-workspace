# Current Status (2026-07-07)

**状態: 現在地の正本。** 長い履歴は [roadmap.md](roadmap.md) に残し、今どこまで進んだか・次に何を見るかをここにまとめる。

## 現在の到達点

- SelfMatrix は Synapse + PostgreSQL + Cinny fork + Element Call fork + LiveKit SFU の構成で稼働済み。
- UI 合意の正本は [ui-design-notes.md](../design/ui-design-notes.md) v1.5 と [mocks/ui-mock.html](../design/mocks/ui-mock.html) v2.2。
- 通話 UI は画面共有特化、視聴オプトイン、画質/FPS ピッカー、話者オーバーレイ、ユーザー/配信音量調整、RNNoise ノイズ抑制まで実装済み。
- 別ウィンドウ通話開始モードは [call-window-mode.md](../design/call-window-mode.md) v1.4 で UI 合意済みだが、実装はネイティブ化検討の結論待ち。
- クライアントのネイティブ化は [native-client-rethink.md](../design/native-client-rethink.md) v0.1 のドラフト段階。次の判断ゲートは [desktop-window-spike.md](../spikes/desktop-window-spike.md)。

## 次の判断ゲート

1. [desktop-window-spike.md](../spikes/desktop-window-spike.md) を実施する。
2. Electron WebContentsView で動作中の通話 view をウィンドウ間で再親子付けしても、EC widget / LiveKit 接続がリロード・再参加しないか確認する。
3. 成立するなら `selfmatrix-desktop` 案 A -> 案 B を roadmap に追加する。
4. 成立しない、または実装コストが高すぎるなら、web 版の [call-window-mode.md](../design/call-window-mode.md) を実装候補に戻す。

## 直近の未完了

未完了・保留・検証待ちは [backlog.md](backlog.md) を正とする。主なもの:

- desktop window spike
- グリッド配信タイルのストリーム単体ポップアウト `🗗`
- SFU 切断時の自動再参加
- 4K60 x 3 本 + 10 人相当の負荷・品質検証
- ネイティブ化する場合の外部ミュート制御

## 読み順

新しい AI / 人に渡す場合は、次の順で読むと迷いにくい。

1. [README.md](../README.md)
2. [requirements.md](requirements.md)
3. この文書
4. [ui-design-notes.md](../design/ui-design-notes.md)
5. [backlog.md](backlog.md)
6. 必要に応じて [roadmap.md](roadmap.md) と [reviews/README.md](../reviews/README.md)
