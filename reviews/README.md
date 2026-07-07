# Reviews Index

**状態: レビュー記録の索引。** 詳細な指摘本文は各ファイルに残し、対応状況の入口をここに置く。

| 日付 | ファイル | 対象 | 結論 / 状態 |
| --- | --- | --- | --- |
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
