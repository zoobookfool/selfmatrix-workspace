# selfmatrix-workspace

[SelfMatrix](https://github.com/zoobookfool/selfmatrix) プロジェクトの**作業リポジトリ**です。計画・設計・スパイク記録・レビュー・モックなど、開発プロセスの文書をここに置きます。**製品そのもの (デプロイ雛形・クライアント fork) はここにはありません** — 製品リポジトリは目的・構成・使い方のドキュメントだけを持ち、作業物はすべてこちらに分離しています (2026-07-06 の運用ルール)。フォークでのスパイク (技術検証) はコードを fork 側の `spike/*` ブランチに、記録をここに置きます (詳細は [fork-strategy.md](planning/fork-strategy.md))。

## リポジトリ体制

| リポジトリ | 中身 |
| --- | --- |
| [selfmatrix](https://github.com/zoobookfool/selfmatrix) | デプロイ雛形 (compose/スクリプト) と利用・運用ドキュメント |
| [selfmatrix-cinny](https://github.com/zoobookfool/selfmatrix-cinny) | クライアント fork (Cinny) |
| [selfmatrix-element-call](https://github.com/zoobookfool/selfmatrix-element-call) | 通話 UI fork (Element Call) |
| [selfmatrix-hires](https://github.com/zoobookfool/selfmatrix-hires) | ハイレゾ音声の拡張オプション |
| **selfmatrix-workspace** (ここ) | 計画・設計・スパイク・レビュー・モック |

## フォルダ構成 (2026-07-07 整理)

| フォルダ | 中身 |
| --- | --- |
| `planning/` | 要件・ロードマップ・fork 運用方針 (プロジェクトの正本) |
| `design/` | UI 設計の合意・検討ドラフト・モック |
| `spikes/` | 技術検証の記録と証跡 |
| `reviews/` | AI レビューの記録 |
| `fixes/` | 個別修正の記録とパッチ |

## 目次

### 計画・要件 (`planning/`)

- [requirements.md](planning/requirements.md) — 要件の正本 (MUST/SHOULD/LATER/OUT)
- [roadmap.md](planning/roadmap.md) — Phase 0〜8 の進行計画と各 Phase の完了記録
- [fork-strategy.md](planning/fork-strategy.md) — fork 運用方針 (upstream 追従・差分最小化)

### UI 設計 (`design/`)

- [ui-design-notes.md](design/ui-design-notes.md) — UI 合意の正本 (v1.4)
- [mocks/ui-mock.html](design/mocks/ui-mock.html) — 操作できる UI モック (v2.2、ブラウザで直接開ける)
- [native-client-rethink.md](design/native-client-rethink.md) — クライアントのネイティブアプリ化 (要件再定義の検討ドラフト)
- [call-window-mode.md](design/call-window-mode.md) — 別ウィンドウ通話開始モードの設計検討 (ドラフト)
- [ec-tile-ui-plan.md](design/ec-tile-ui-plan.md) — EC タイル UI の実装計画と進捗
- [i18n.md](design/i18n.md) — 多言語対応 (言語パック方式) の設計

### スパイク・検証記録 (`spikes/`)

- [client-spike.md](spikes/client-spike.md) / [client-spike-results.md](spikes/client-spike-results.md) — クライアント選定スパイク (Phase 2a)
- [popout-spike.md](spikes/popout-spike.md) — ポップアウト検証 (+ [popout-spike-evidence/](spikes/popout-spike-evidence))
- [hires-spike.md](spikes/hires-spike.md) — ハイレゾ音声スパイク (JackTrip)
- [bandwidth-comparison.md](spikes/bandwidth-comparison.md) — VPS 帯域比較

### レビュー記録 (`reviews/`)

- [reviews/](reviews/) — AI レビューの記録 (Sonnet 5 / Opus 4.8 / GPT)。指摘の対応状況は roadmap の該当節を参照

### 修正記録 (`fixes/`)

- [cinny-typecheck-fix.md](fixes/cinny-typecheck-fix.md) (+ [patches/](fixes/patches)) / [upstream-issue-cinny-typecheck.md](fixes/upstream-issue-cinny-typecheck.md)

## 履歴について

これらの文書は 2026-07-06 まで selfmatrix リポジトリの `docs/` にあり、それ以前の変更履歴はそちらの git history に残っています。2026-07-07 にリポジトリ直下のフラット構造から現在のフォルダ構成へ整理しました (それ以前の外部リンクはパス読み替えが必要です)。
