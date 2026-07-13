# Reviews Index

**状態: レビュー記録の索引。** 詳細な指摘本文は各ファイルに残し、対応状況の入口をここに置く。

| 日付 | ファイル | 対象 | 結論 / 状態 |
| --- | --- | --- | --- |
| 2026-07-14 | [gpt-review-native-ui-followup-20260714.md](gpt-review-native-ui-followup-20260714.md) | nativeドッグフーディング①②⑥⑦、Discordアプリ実測、Cinny/EC/desktop通話UI | ①z-order構造、②通話イベント洪水、⑥メイン/別窓UI不一致を解消。⑦画面共有経路をEC実ボタンへ統一し自動probe green。nativeで動かない配信単体popoutボタンも非表示。実2ユーザー画面共有はP1運用ゲートとして継続。Cinny `ffefe11` / EC `e662d28` / desktop `095bbe9` |
| 2026-07-13 | [dogfooding-native-20260713.md](dogfooding-native-20260713.md) | native アプリ実使用フィードバック (運用者、本番サーバー実使用) | 9所見をtriage。④⑧はdesktop `ec5c207`、①②⑥と⑦の実装側は2026-07-14修正で対応。⑤、③⑨、⑦の実通話受け入れを継続 |
| 2026-07-12 | [claude-review-full-project-20260712.md](claude-review-full-project-20260712.md) | GPT 修正パス (desktop `9b6e66d`..`75c5f23` / cinny `08958070`+`ec64b637` / EC `e31f335f` / workspace `9bf8426`) の独立検証 (Fable、5 領域並列 + 敵対的反証) | GPT 修正は実体ありと確認 (packaged updater 3 ケース・SHA 固定・latest 廃止・audit 0 を実測)。反証通過の実指摘 3 件: **① P1 ダウングレード攻撃 → desktop `c51fafc` でバージョン束縛を実装・解消** (packaged 4 ケース + 変異ゲート)、② TOCTOU → 既知制約として release-pipeline へ文書化、③ GPT 文書の eslint warning 数誤り → 訂正注記。P3 は cinny `34d46f15` / EC `198a8bc0` で対応 |
| 2026-07-12 | [gpt-review-full-project-20260712.md](gpt-review-full-project-20260712.md) | reviewed: workspace `1c17184` / desktop `5fc3909` / cinny `9ea79b8` / EC `db6693f` / selfmatrix `44f5c41` / hires `9e7775b` | 全体レビュー。**全Finding実装修正済み**: desktop `9b6e66d`+`75c5f23`、Cinny `08958070`+`ec64b637`、EC `e31f335f`、selfmatrix `d55ff4a`。packaged updater fail-closed、immutable配布、固定release入力、CI/audit、desktop作法を反映。残りは初回公開・実minisign・GitHub保護設定等の運用ゲート。※検証表の Cinny eslint warning 数は Claude 検証で訂正済み (3→139、本文注記参照) |
| 2026-07-08 | [gpt-review-desktop-m2-readiness-followup-20260708.md](gpt-review-desktop-m2-readiness-followup-20260708.md) | selfmatrix-workspace `c57da2c` / selfmatrix-desktop `0db93ed` | GPT M2 readiness 対応後レビュー。実装 P1/P2 は概ね解消。残 P2: current-status/native-milestones に「対応中」「要運用者承認」「未対処」「更新予定」の古い表現が残る |
| 2026-07-08 | [gpt-review-desktop-m2-readiness-20260708.md](gpt-review-desktop-m2-readiness-20260708.md) | selfmatrix-workspace `c47d857` / selfmatrix-desktop `be1e9aa` | M2 製品化前レビュー。P1: desktop 通常起動が harness / 正本 docs が承認待ちのまま / mainWindow navigation が origin のみ。P2: M1 注記 stale / prototype 名残り。**全対応済み (2026-07-08)**: docs は workspace aad8a72、desktop コードは 0db93ed (起動既定反転 / nav 厳格化 + smoke 回帰検証 / 改名。E2E 全 green で受け入れ)。GPT 指摘 D の前提「cinny が prototype WIDGET_ID を参照」は誤認と判明 (cinny は call-embed 固定) |
| 2026-07-08 | [claude-review-m1-holistic-20260708.md](claude-review-m1-holistic-20260708.md) | M1 全体再レビュー (Fable、4 視点 + 敵対的検証) | 技術成立は維持、完成度主張を 2 点下方修正。critical 3 + major 3 を仕分け (今すぐ修正 / M2 格上げ)。GPT レビューと相補 |
| 2026-07-08 | [gpt-review-native-m1-20260708.md](gpt-review-native-m1-20260708.md) | Fable 更新後の native M1 全体レビュー | M1 技術成立性は強い。P1: `openCallView` URL 検証の必須項目不足、preload 重複登録 (本物のバグ)、正本ドキュメント追従漏れ。P2: 通話窓仕様の文書矛盾、CallControl DOM 監視の再マウント耐性。C1/C2 で対応 |
| 2026-07-08 | [claude-review-m1-step3c23-20260708.md](claude-review-m1-step3c23-20260708.md) | M1 step 3c-2/3 (2 ユーザー通話+配信+窓移動無再接続 E2E) | **M1 受け入れ条件成立**。major 3 件 (移動の積極的証拠/own-window 混入/localStorage live 化) を H1〜H6 即日修正して**受け入れ** |
| 2026-07-08 | [claude-review-m1-step3c1-20260708.md](claude-review-m1-step3c1-20260708.md) | M1 step 3c-1 (実ログイン→実 LiveKit join E2E) | E2E 独立再実行 PASS。実バグ 4 件修正を確認、fail-closed 化等を適用して**受け入れ** |
| 2026-07-07 | [claude-review-m1-step3b-20260707.md](claude-review-m1-step3b-20260707.md) | M1 step 3b (シェル契約適合 + cinny 契約拡張) | 変異 4 種全検知。ok 未検査 (critical、誤ミュート実害) 等 G1〜G7 即日修正して**受け入れ** |
| 2026-07-07 | [claude-review-m1-step3a-20260707.md](claude-review-m1-step3a-20260707.md) | M1 step 3a (cinny native/ モジュール、spike/native-shell) | popout 素通り降格等 major 2 件を A〜E 即日修正して**受け入れ**。E2E ゲートは 3c |
| 2026-07-07 | [claude-review-m1-step2-20260707.md](claude-review-m1-step2-20260707.md) | M1 step 2 (CallControl DOM 移設の単体実証) | 変異 4 種全検知。realClickConfirmed 未組込等 major 3 件を F6〜F9 即日修正して**受け入れ** |
| 2026-07-07 | [claude-review-m1-step1-20260707.md](claude-review-m1-step1-20260707.md) | M1 step 1 (実 ClientWidgetApi トランスポート) | 変異 d すり抜けで差し戻し → F1〜F5 即日修正・全変異検知を実測して**受け入れ** |
| 2026-07-07 | [claude-review-gpt-round2-20260707.md](claude-review-gpt-round2-20260707.md) | EC `99a01f02` / cinny `5207a20` | critical 1 件。視聴中配信が emphasis で消える問題は EC `db6693f7` で修正済み |
| 2026-07-06 | [gpt-review-2026-07-06-276bbbd.md](gpt-review-2026-07-06-276bbbd.md) | selfmatrix 系 docs/ops | 当時のレビュー記録。対応済み項目は roadmap Phase 8 と各実装履歴へ移動済み |
| 2026-07-06 | [gpt-review-2026-07-06-e5fd695.md](gpt-review-2026-07-06-e5fd695.md) | selfmatrix 更新分 | federation / custom homeserver 周辺のレビュー。現行要件は requirements.md §5 を正とする |
| 2026-07-06 | [gpt-review-2026-07-06-for-ai.md](gpt-review-2026-07-06-for-ai.md) | 他 AI へ渡すための GPT レビュー整理 | 指摘の大半は Wave C/D と Phase 8 実装で対応済み。未完了は backlog.md へ集約 |
| 2026-07-06 | [opus48-review-2026-07-06.md](opus48-review-2026-07-06.md) | Sonnet レビューの再評価 | 高優先度所見は Wave C/D で対応済み。判断記録として保管 |
| 2026-07-06 | [sonnet5-review-2026-07-06.md](sonnet5-review-2026-07-06.md) | UI / 通話 / 運用の敵対的レビュー | design-mismatch / ux 指摘の多くは Phase 8 実装で対応済み。未完了は backlog.md を見る |

## 更新ルール

- 新しいレビューを追加したら、この表へ 1 行追加する。
- 未対応の P1/P2 指摘は [backlog.md](../planning/backlog.md) にも追加する。
- 対応済みにした場合は、修正 commit / 実装記録 / 本番反映日を「結論 / 状態」に追記する。
- 古いレビュー本文は削除しない。判断の履歴として残す。
- [claude-review-native-prototype-20260707.md](claude-review-native-prototype-20260707.md) — ネイティブ化スパイク実測 + prototype (f7d0e4b..beb7d85)。技術クレームは独立再現で確認 (案 B 成立)。must-fix 5 件 (widget-protocol CLI のトートロジー等)、対応待ち
- [claude-review-m0-20260707.md](claude-review-m0-20260707.md) — M0 受け入れレビュー (9b45b6b)。差し戻し → **4c82206 で解消・完了** (変異 a〜f 全検知を実測)
