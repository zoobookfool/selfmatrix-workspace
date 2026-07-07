# Backlog (2026-07-07)

**状態: 未完了・保留事項の正本。** [roadmap.md](roadmap.md) は履歴も含むため長い。次に着手する候補や判断ゲートはこの文書を優先する。

| 優先 | 項目 | 状態 | 参照 | 完了条件 |
| --- | --- | --- | --- | --- |
| P0 | Test harness 整備 | 最小実装追加、CLI/static/Electron smoke 済み | [test-harness.md](../design/test-harness.md), [native-client-rethink.md](../design/native-client-rethink.md) | Playwright UI test まで実行でき、ネイティブ固有でない回帰を Electron なしで確認できる |
| P0 | Native prototype の Cinny widget host 接続 | 最小 Electron prototype 追加、bridge smoke 済み | [native-client-rethink.md](../design/native-client-rethink.md), [desktop-window-spike.md](../spikes/desktop-window-spike.md) | Cinny 本体の widget host / ClientWidgetApi 相当と `WebContentsView` EC view が接続され、実 join 前の widget action が prototype 上で通る |
| P0 | Electron WebContentsView による通話 view 再親子付け検証 | prototype smoke 済み、最終 LiveKit join 待ち | [desktop-window-spike.md](../spikes/desktop-window-spike.md), [native-client-rethink.md](../design/native-client-rethink.md) | 実 EC + dev MatrixRTC で join / 共有中 view 移動 / system audio まで確認し、production 実装可否が決まる |
| P0 | ネイティブ化するか web 版別窓開始モードを実装するかの判断 | ネイティブ小型 prototype 優先 | [call-window-mode.md](../design/call-window-mode.md), [native-client-rethink.md](../design/native-client-rethink.md) | prototype 結果で native 案 B 継続、または web 版実装再開が決まる |
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
