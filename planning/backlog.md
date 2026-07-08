# Backlog (2026-07-08)

**状態: 未完了・保留事項の正本。** [roadmap.md](roadmap.md) は履歴も含むため長い。次に着手する候補や判断ゲートはこの文書を優先する。

| 優先 | 項目 | 状態 | 参照 | 完了条件 |
| --- | --- | --- | --- | --- |
| P0 | ネイティブ化 M1 (通話コアの技術成立) | **完了 (2026-07-08)**。実 join / 無再接続窓移動 3 往復 / 配信 / system audio / localStorage 契約すべて E2E PASS。matrix-widget-api 無改造 | [native-milestones.md](native-milestones.md), [native-widget-transport.md](../design/native-widget-transport.md), [reviews/README.md](../reviews/README.md) の claude-review-m1-* | dev スタックで 2 ユーザー通話 + 配信 + 無再接続の窓往復が E2E で PASS → 達成 |
| P0 | M2 製品化タスク一式 | **進行中 (2026-07-08 開始)**。案 B 正式 GO 承認済み・selfmatrix-desktop 新設済み・bounds 同期完了。残: web tree-shake / mainWindow 監査 / homeserver 選択制 / ソース選択 UI / トレイ / リリース CI + minisign | [native-milestones.md](native-milestones.md) M2, [web-native-parallel.md](web-native-parallel.md) | インストーラから接続して通話一式が動く + 自動更新実機確認 + Electron セキュリティ監査 PASS |
| P1 | アプリ単位音声キャプチャ (OBS 相当) | 再調査済み (WASAPI プロセスループバック、工数中)。**M2 MUST にはせず M3 以降推奨** | [spikes/app-audio-capture-spike.md](../spikes/app-audio-capture-spike.md) | 特定アプリの音声を配信に載せられる (MS ApplicationLoopback ベースの napi 実装) |
| P1 | ユーザーカスタム機構 (プラグイン/テーマ/フィルタ) | ドラフト (運用者回答反映済み・GPT レビュー待ち)。テーマ=トークン確定、プラグイン=サンドボックス型 | [user-customization.md](../design/user-customization.md) | 段階導入案の確定 → M いくつ相当に割り付け |
| ~~P0~~ | ~~web ビルドの native 分岐無効化~~ | **実装完了 (2026-07-08、cinny 0439af23)** — web dist から native 識別子消失を grep 実測。**本番反映は spike→product 統合 + デプロイ時** (M2 の統合項目に含む) | [native-milestones.md](native-milestones.md) M2 | — |
| P1 | 話者オーバーレイ右クリックからのユーザー単位音量調整 | 未実装 | [ui-design-notes.md](../design/ui-design-notes.md) | 配信上の話者ピル/オーバーレイから対象ユーザーのミュート・音量調整へ到達できる |
| P1 | グリッド配信タイルのストリーム単体ポップアウト `🗗` | 保留 | [ui-design-notes.md](../design/ui-design-notes.md), [call-window-mode.md](../design/call-window-mode.md) | 視聴中配信タイルから再接続なしの単体ポップアウトを開ける |
| P1 | SFU 切断時の自動再参加 | 未実施 | [roadmap.md](roadmap.md) Phase 8 | LiveKit ルーム消失後、手動再参加なしで通話へ戻れる、または明確な再参加導線が出る |
| P1 | 4K60 x 3 本 + 10 人相当の負荷・品質検証 | 保留 | [requirements.md](requirements.md) §3, [roadmap.md](roadmap.md) Phase 3/5 | 帯域・CPU・画質の実測を記録し、運用可能な既定値を確認する |
| P2 | RNNoise 既定 ON の聴感評価 | 未実施 | [requirements.md](requirements.md) §3, [roadmap.md](roadmap.md) Phase 8 | 運用者が実通話で評価し、体感が悪ければ既定 OFF または設定文言を見直す |
| P2 | ネイティブ化時の外部ミュート制御 | 検討待ち | [native-client-rethink.md](../design/native-client-rethink.md) | Stream Deck 等から安全にミュート制御できる方式を決める |
| P2 | periodic security/audit 棚卸し | 継続 | [roadmap.md](roadmap.md) Phase 8 | EC/Cinny/Electron の依存監査と upstream security 差分確認を定期化する |
| P2 | E2EE オンライン鍵バックアップの運用者設定確認 | 推奨 | [roadmap.md](roadmap.md) Phase 8 | 運用者アカウントで鍵バックアップを有効化し、復元手順を確認する |

## 更新ルール

- レビューで未対応 P1/P2 が出たら、この表にも 1 行追加する。
- 実装が完了したら、対応 commit / PR / 本番反映日を状態欄に追記し、必要なら [roadmap.md](roadmap.md) へ履歴として移す。
- 検討ドラフトが正本化されたら、参照先を [requirements.md](requirements.md) または [ui-design-notes.md](../design/ui-design-notes.md) に更新する。
