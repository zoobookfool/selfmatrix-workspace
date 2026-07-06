# selfmatrix-workspace

[SelfMatrix](https://github.com/zoobookfool/selfmatrix) プロジェクトの**作業リポジトリ**です。計画・設計・スパイク記録・レビュー・モックなど、開発プロセスの文書をここに置きます。**製品そのもの (デプロイ雛形・クライアント fork) はここにはありません** — 製品リポジトリは目的・構成・使い方のドキュメントだけを持ち、作業物はすべてこちらに分離しています (2026-07-06 の運用ルール)。

## リポジトリ体制

| リポジトリ | 中身 |
| --- | --- |
| [selfmatrix](https://github.com/zoobookfool/selfmatrix) | デプロイ雛形 (compose/スクリプト) と利用・運用ドキュメント |
| [selfmatrix-cinny](https://github.com/zoobookfool/selfmatrix-cinny) | クライアント fork (Cinny) |
| [selfmatrix-element-call](https://github.com/zoobookfool/selfmatrix-element-call) | 通話 UI fork (Element Call) |
| [selfmatrix-hires](https://github.com/zoobookfool/selfmatrix-hires) | ハイレゾ音声の拡張オプション |
| **selfmatrix-workspace** (ここ) | 計画・設計・スパイク・レビュー・モック |

## 目次

### 計画・要件

- [requirements.md](requirements.md) — 要件の正本 (MUST/SHOULD/LATER/OUT)
- [roadmap.md](roadmap.md) — Phase 0〜8 の進行計画と各 Phase の完了記録
- [fork-strategy.md](fork-strategy.md) — fork 運用方針 (upstream 追従・差分最小化)

### UI 設計

- [ui-design-notes.md](ui-design-notes.md) — UI 合意の正本 (v1.4)
- [mocks/ui-mock.html](mocks/ui-mock.html) — 操作できる UI モック (v2.2、ブラウザで直接開ける)
- [ec-tile-ui-plan.md](ec-tile-ui-plan.md) — EC タイル UI の実装計画と進捗
- [i18n.md](i18n.md) — 多言語対応 (言語パック方式) の設計

### スパイク・検証記録

- [client-spike.md](client-spike.md) / [client-spike-results.md](client-spike-results.md) — クライアント選定スパイク (Phase 2a)
- [popout-spike.md](popout-spike.md) — ポップアウト検証 (+ [popout-spike-evidence/](popout-spike-evidence/))
- [hires-spike.md](hires-spike.md) — ハイレゾ音声スパイク (JackTrip)
- [bandwidth-comparison.md](bandwidth-comparison.md) — VPS 帯域比較

### レビュー記録

- [reviews/](reviews/) — AI レビューの記録 (Sonnet 5 / Opus 4.8 / GPT)。指摘の対応状況は roadmap の該当節を参照

### 修正記録

- [cinny-typecheck-fix.md](cinny-typecheck-fix.md) (+ [patches/](patches/)) / [upstream-issue-cinny-typecheck.md](upstream-issue-cinny-typecheck.md)

## 履歴について

これらの文書は 2026-07-06 まで selfmatrix リポジトリの `docs/` にあり、それ以前の変更履歴はそちらの git history に残っています。
