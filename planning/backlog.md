# Backlog (2026-07-14)

**状態: 未完了・保留事項の正本。** 完了履歴の詳細は[roadmap.md](roadmap.md)と
[native-milestones.md](native-milestones.md)へ残す。

| 優先 | 項目 | 状態 | 参照 | 完了条件 |
| --- | --- | --- | --- | --- |
| P0 | M2/M4 初回native公開と混在受け入れ | **v0.1.0 draft 作成済み (2026-07-14)、署名/publish 待ち**。初回tag CI green・BUILD-MANIFEST 3コミット一致・SHA256SUMS 確認済み (installer 4dec8c47…)。残り: 運用者の minisign 署名 (-t 必須) → publish → 初回確認6項目。GitHub branch/tag保護は未設定のまま | [native-milestones.md](native-milestones.md), [release-pipeline.md](../design/release-pipeline.md) | desktop main/v*保護方針を設定 → ~~初回tag CI green~~ → 実minisignクロスチェック → publish → 旧版から自動更新 → 友達native + web混在通話を実測 |
| P1 | 画面共有ができない (単独時に顕著) | **修正実装済み、実通話再確認待ち** (2026-07-14)。native の可視操作面を Element Call フッターへ統一し、実ボタンからネイティブ共有元ピッカーへ到達する経路へ変更。desktop source-picker probeは通過し、更新済みE2Eコードは構文確認済みだが、認証情報が無いため実アカウント2名の `e2e:callflow` は未実行 | [dogfooding-native-20260713.md](../reviews/dogfooding-native-20260713.md) ⑦、desktop `095bbe9` | 単独で共有開始でき、2名通話で相手に映像/音声が届くことを実機確認する |
| P2 | デバイス認証ができない (要切り分け) | ドッグフーディング検出 (2026-07-13)。web版で再現するか等、切り分け待ち | [dogfooding-native-20260713.md](../reviews/dogfooding-native-20260713.md) ⑤ | 新デバイスでE2EE認証が完了できる |
| P2 | UI総点検 (Discord実物突き合わせ) + チャンネル/ユーザーの描き分け | ドッグフーディング総評「UIは基本カス」(2026-07-13)。個別修正と別軸のテーマ | [dogfooding-native-20260713.md](../reviews/dogfooding-native-20260713.md) ③⑨ | 主要画面のレイアウト/文言/描き分けをDiscord基準で点検し改善する |
| P1 | nativeの配信タイル単体ポップアウト `🗗` | web/ECの手動`window.open`版は実装済み。native shellはrenderer生成窓を安全上拒否するため未対応で、2026-07-14に死んだnativeボタンだけ非表示化。自動追従PiPは不採用 | [ui-design-notes.md](../design/ui-design-notes.md), [call-window-mode.md](../design/call-window-mode.md) | secureなhost契約で、視聴中配信だけを再接続なしで明示的に別窓表示できる。画面遷移への自動追従はしない |
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
- native 通話メニューの WebContentsView z-order 問題: native の重複 Cinny 通話バーを外し、メイン/別窓の
  両方を Element Call 共通フッターへ統一 (Cinny `ffefe11`、Element Call `e662d28`、desktop `095bbe9`)。
- メイン/別窓の通話UI不一致: 同じ Element Call フッターを再親子付け先にかかわらず表示し解消 (同上)。
- Discord に存在しない通話参加/終了タイムライン行: 折りたたみではなく完全非表示 (Cinny `2280a26`)。
- 話者オーバーレイ右クリックからのユーザー別ミュート/音量スライダー (Element Call `dd8966aa`)。
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
