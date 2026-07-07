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
| `test-harness/` | ネイティブ版前段の Web UI / Widget protocol / Electron smoke 検証入口 |

## 文書の読み方

| 状態 | 意味 |
| --- | --- |
| 正本 | 現時点の合意。実装・レビュー・他 AI への依頼はこの内容を優先する |
| 視覚基準 | 見た目・配置・操作感の基準。仕様と衝突した場合は正本を優先する |
| ドラフト | 検討中。結論が出るまで requirements / roadmap へは反映しない |
| 実装保留 | UI 合意または設計は確定済みだが、別の判断ゲート待ちで実装しない |
| 履歴 | 当時の判断・証跡。最新方針は正本または current-status/backlog を見る |

## 目次

### 計画・要件 (`planning/`)

| 文書 | 状態 | 次アクション / 読み方 |
| --- | --- | --- |
| [requirements.md](planning/requirements.md) | 正本 | MUST/SHOULD/LATER/OUT の要件判断はここを優先 |
| [current-status.md](planning/current-status.md) | 正本 | 今どこまで進んでいて、次に何を見るかの短い入口 |
| [backlog.md](planning/backlog.md) | 正本 | Phase 8 以降の未完了・保留・判断ゲート |
| [roadmap.md](planning/roadmap.md) | 履歴 + 計画 | Phase 0〜8 の進行記録。現在の短期タスクは backlog を見る |
| [fork-strategy.md](planning/fork-strategy.md) | 正本 | fork 運用方針 (upstream 追従・差分最小化) |

### UI 設計 (`design/`)

| 文書 | 状態 | 次アクション / 読み方 |
| --- | --- | --- |
| [ui-design-notes.md](design/ui-design-notes.md) | 正本 | UI 合意 v1.5。通話・配信・シェルの現行方針 |
| [mocks/ui-mock.html](design/mocks/ui-mock.html) | 視覚基準 | 操作できる UI モック v2.2。v1.5 の追加仕様と衝突する場合は ui-design-notes を優先 |
| [call-window-mode.md](design/call-window-mode.md) | 実装保留 | 別ウィンドウ通話開始モード v1.4。ネイティブ化検討の結論待ち |
| [native-client-rethink.md](design/native-client-rethink.md) | ドラフト | クライアントのネイティブアプリ化。小型 prototype 着手可、最終 LiveKit join 待ち |
| [test-harness.md](design/test-harness.md) | ドラフト | ネイティブ版の前段として Web UI / Widget protocol CLI / Electron smoke の検証入口を整理。最小実装あり |
| [ec-tile-ui-plan.md](design/ec-tile-ui-plan.md) | 履歴 | EC タイル UI の実装計画と進捗 |
| [i18n.md](design/i18n.md) | 正本 | 多言語対応 (言語パック方式) の設計 |

### スパイク・検証記録 (`spikes/`)

| 文書 | 状態 | 次アクション / 読み方 |
| --- | --- | --- |
| [desktop-window-spike.md](spikes/desktop-window-spike.md) | 一部実測済み | 小型 prototype 着手可。最終 LiveKit join / 共有中移動 / system audio 検証待ち |
| [client-spike.md](spikes/client-spike.md) / [client-spike-results.md](spikes/client-spike-results.md) | 履歴 | クライアント選定スパイク (Phase 2a) |
| [popout-spike.md](spikes/popout-spike.md) | 履歴 | ポップアウト検証 (+ [popout-spike-evidence/](spikes/popout-spike-evidence)) |
| [hires-spike.md](spikes/hires-spike.md) | 履歴 | ハイレゾ音声スパイク (JackTrip) |
| [bandwidth-comparison.md](spikes/bandwidth-comparison.md) | 履歴 | VPS 帯域比較 |

### レビュー記録 (`reviews/`)

- [reviews/README.md](reviews/README.md) — AI レビューの索引。対象・結論・対応状況をここで確認

### 修正記録 (`fixes/`)

- [cinny-typecheck-fix.md](fixes/cinny-typecheck-fix.md) (+ [patches/](fixes/patches)) / [upstream-issue-cinny-typecheck.md](fixes/upstream-issue-cinny-typecheck.md)

## 履歴について

これらの文書は 2026-07-06 まで selfmatrix リポジトリの `docs/` にあり、それ以前の変更履歴はそちらの git history に残っています。2026-07-07 にリポジトリ直下のフラット構造から現在のフォルダ構成へ整理しました (それ以前の外部リンクはパス読み替えが必要です)。
