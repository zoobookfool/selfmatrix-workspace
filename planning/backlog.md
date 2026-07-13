# Backlog (2026-07-12)

**状態: 未完了・保留事項の正本。** 完了履歴の詳細は[roadmap.md](roadmap.md)と
[native-milestones.md](native-milestones.md)へ残す。

| 優先 | 項目 | 状態 | 参照 | 完了条件 |
| --- | --- | --- | --- | --- |
| P0 | M2/M4 初回native公開と混在受け入れ | **実装完了、運用ゲート待ち**。packaged製品の実NsisUpdaterで正常/欠落/改ざん検証済み。product lock、CI、実公開鍵、draft workflowも実装済み。GitHub branch/tag保護は未設定 | [native-milestones.md](native-milestones.md), [release-pipeline.md](../design/release-pipeline.md) | desktop main/v*保護方針を設定 → 初回tag CI green → 実minisignクロスチェック → publish → 旧版から自動更新 → 友達native + web混在通話を実測 |
| P1 | 画面共有ができない (単独時に顕著) | ドッグフーディング検出 (2026-07-13)。GPT対応予定。CallControl.ts の DOM クリック対象不在の疑い、既知「単独参加中の共有開始クリック喪失」と同クラス。要再現切り分け | [dogfooding-native-20260713.md](../reviews/dogfooding-native-20260713.md) ⑦ | 通話中に画面共有が開始でき、相手に映る (単独/複数とも) |
| P1 | 通話 WebContentsView 上に cinny の⋮メニュー/ポップオーバーが隠れる | ドッグフーディング検出 (2026-07-13、native限定)。GPT対応予定 | [dogfooding-native-20260713.md](../reviews/dogfooding-native-20260713.md) ① | 通話中でもヘッダー⋮等のメニューが前面に出て操作できる |
| P2 | 後追い参加時に過去の通話参加/終了イベントが洪水 | ドッグフーディング検出 (2026-07-13、web共通)。GPT対応予定。RoomTimeline.tsx でコールイベントの集約が無い | [dogfooding-native-20260713.md](../reviews/dogfooding-native-20260713.md) ② | 連続する通話参加/終了イベントが折りたたまれ、履歴で洪水にならない |
| P2 | ポップアウト窓とメイン通話のUI一貫性 | ドッグフーディング検出 (2026-07-13、native限定)。M3のフッター出し分け起因、設計判断含む | [dogfooding-native-20260713.md](../reviews/dogfooding-native-20260713.md) ⑥ | 別窓とメインで操作系の見た目が一貫する |
| P2 | デバイス認証ができない (要切り分け) | ドッグフーディング検出 (2026-07-13)。web版で再現するか等、切り分け待ち | [dogfooding-native-20260713.md](../reviews/dogfooding-native-20260713.md) ⑤ | 新デバイスでE2EE認証が完了できる |
| P2 | UI総点検 (Discord実物突き合わせ) + チャンネル/ユーザーの描き分け | ドッグフーディング総評「UIは基本カス」(2026-07-13)。個別修正と別軸のテーマ | [dogfooding-native-20260713.md](../reviews/dogfooding-native-20260713.md) ③⑨ | 主要画面のレイアウト/文言/描き分けをDiscord基準で点検し改善する |
| P1 | 話者オーバーレイ右クリックからのユーザー単位音量調整 | 未実装 | [ui-design-notes.md](../design/ui-design-notes.md) | 配信上の話者ピル/オーバーレイから対象ユーザーのミュート・音量調整へ到達できる |
| P1 | グリッド配信タイルのストリーム単体ポップアウト `🗗` | 保留。通話全体の無再接続ポップアウトはnative M3で完了 | [ui-design-notes.md](../design/ui-design-notes.md), [call-window-mode.md](../design/call-window-mode.md) | 視聴中配信タイルだけを再接続なしで別窓表示できる |
| P1 | SFU切断時の自動再参加 | 未実施 | [roadmap.md](roadmap.md) Phase 8 | LiveKit room消失後に自動復帰、または明確な再参加導線を出す |
| P1 | 4K60 x 3本 + 10人相当の負荷・品質検証 | 保留 | [requirements.md](requirements.md) §3 | 帯域・CPU・画質の実測と運用可能な既定値を記録する |
| P1 | アプリ単位音声キャプチャ (OBS相当) | 再調査済み。WASAPI process loopback、工数中。M2 MUST外 | [app-audio-capture-spike.md](../spikes/app-audio-capture-spike.md) | 特定アプリの音声だけを配信へ載せられる |
| P1 | ユーザーカスタム機構 | ドラフト。テーマ=token、plugin=sandbox型 | [user-customization.md](../design/user-customization.md) | 段階導入案を確定しmilestoneへ割り付ける |
| P2 | RNNoise既定ONの聴感評価 | 未実施 | [requirements.md](requirements.md) §3 | 実通話で評価し、問題があれば既定値または説明を見直す |
| P2 | 外部ミュート制御 | A+B実装済み。実通話目視確認待ち。C公式pluginはLATER | [external-mute-control.md](../design/external-mute-control.md) | hotkey/APIから実通話ミュートが反転することを目視。Cは需要確認後 |
| P2 | periodic security/audit棚卸し | desktop/EC/Cinny production auditをCI化、継続 | [release-pipeline.md](../design/release-pipeline.md) | audit 0を維持し、upstream security差分と例外を定期記録する |
| P2 | E2EEオンライン鍵バックアップ確認 | 推奨 | [roadmap.md](roadmap.md) Phase 8 | 運用者アカウントで有効化し復元手順を確認する |

## 完了した今回の指摘

- native の Electron 既定メニューバー除去 (`selfmatrix-desktop` `ec5c207`)。
- native 単独参加中のスピーカーミュート状態保持と、後から現れた audio への適用 (`selfmatrix-desktop` `ec5c207`)。
- stock updaterの署名検証迂回と`.minisig`未取得。
- mutable web `latest`既定。
- native releaseのbranch入力、Actions major tag、tag-version不一致余地。
- desktop/Element Callのproduct CI不足とElement Call lint失敗。
- Cinny production audit 18件。
- desktop多重起動、通話窓の画面外復元、About版表示の曖昧さ。

## 更新ルール

- 未対応P0/P1/P2がレビューで増えたらこの表へ追加する。
- 実装完了だけで実運用受け入れが残る場合は、完了条件を消さず「運用ゲート待ち」とする。
- 完全に閉じた項目は[roadmap.md](roadmap.md)またはmilestone文書へ移す。
