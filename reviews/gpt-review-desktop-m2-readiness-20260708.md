# GPT Review: selfmatrix-desktop M2 readiness (2026-07-08)

## Scope

- workspace: `zoobookfool/selfmatrix-workspace` `c47d85785d32c39796e2eeafdd36118adf92b3ac`
- desktop: `zoobookfool/selfmatrix-desktop` `be1e9aa5e8d0da2079eb3aa1869ff360414d5738`
- Review only. No files outside `reviews/` were changed by this write-up.
- Tests were not run in this review pass. The review is based on static inspection plus repository state after `git fetch`.

## Summary

Fable/GPT の前回指摘に対する進捗はかなり良い。`realClickVocabulary`、`callRespawn`、`boundsSync` が E2E に入り、`selfmatrix-desktop` も GitHub 側へ作成・push 済みになっている。

ただし、M2 製品化へ進む前に直した方がよい P1 が 3 件ある。特に `selfmatrix-desktop` は製品 repo になったが、通常起動がまだ検証 harness になっている点は早めに直すべき。

## Follow-up status

2026-07-08 follow-up: the findings in this file were reported as handled by workspace `c57da2c` and desktop `0db93ed`. A follow-up review is recorded in [gpt-review-desktop-m2-readiness-followup-20260708.md](gpt-review-desktop-m2-readiness-followup-20260708.md). That pass found no new P1 blocker, but did find remaining P2 documentation wording drift around "対応中 / 要運用者承認 / 未対処".

## Findings

### [P1] `selfmatrix-desktop` の通常起動がまだ検証 harness を開く

`selfmatrix-desktop/package.json` の `start` は引数なしで `electron src/main.cjs` を起動する。

- [`package.json` line 14](https://github.com/zoobookfool/selfmatrix-desktop/blob/be1e9aa5e8d0da2079eb3aa1869ff360414d5738/package.json#L14)
- [`src/main.cjs` line 101](https://github.com/zoobookfool/selfmatrix-desktop/blob/be1e9aa5e8d0da2079eb3aa1869ff360414d5738/src/main.cjs#L101)
- [`src/main.cjs` line 479](https://github.com/zoobookfool/selfmatrix-desktop/blob/be1e9aa5e8d0da2079eb3aa1869ff360414d5738/src/main.cjs#L479)

`--cinny-shell` が無い場合 `isCinnyShell === false` なので、通常起動は `desktop-shell.html` をロードする。製品 repo としては、通常起動・将来の packaged app が本番 topology ではなく検証 harness で立ち上がる危険がある。

Recommended fix:

- 製品 repo では cinny top-frame をデフォルトにする。
- harness は `--harness` / `npm run harness` / `npm run smoke` 側へ退避する。
- README の `npm start` 説明も本番 topology と一致させる。

### [P1] 正本ドキュメントが「承認待ち」のままで現在地を誤誘導する

`current-status.md` と `backlog.md` はまだ「案 B GO / M2 着手 / アプリ音声 LATER が運用者承認待ち」扱いだが、`native-milestones.md` では GO 承認済み、`selfmatrix-desktop` 作成・push 済みになっている。

- [`planning/current-status.md` line 11](../planning/current-status.md#L11)
- [`planning/current-status.md` line 32](../planning/current-status.md#L32)
- [`planning/backlog.md` line 8](../planning/backlog.md#L8)
- [`planning/native-milestones.md` line 67](../planning/native-milestones.md#L67)
- [`planning/native-milestones.md` line 116](../planning/native-milestones.md#L116)

このままだと、次に読む AI が完了済みゲートを再確認しに行く。特に `backlog.md` は未完了・保留事項の正本なので、古い P0 が残るのは危ない。

Recommended fix:

- `current-status.md` を「M2 開始済み / desktop repo 作成済み / native-prototype archived」へ更新する。
- `backlog.md` の P0 を完了扱いにするか、現在の M2 P0 に差し替える。
- アプリ単位音声は「単純 LATER 承認待ち」ではなく、OBS/WASAPI process loopback 再調査済みで、M2 MUST にはしない判断候補として書く。

### [P1] mainWindow のナビゲーション封じ込めが origin 判定だけで広すぎる

`selfmatrix-desktop/src/main.cjs` の mainWindow 封じ込めは same-origin なら許可する。

- [`src/main.cjs` line 492](https://github.com/zoobookfool/selfmatrix-desktop/blob/be1e9aa5e8d0da2079eb3aa1869ff360414d5738/src/main.cjs#L492)
- [`src/main.cjs` line 390](https://github.com/zoobookfool/selfmatrix-desktop/blob/be1e9aa5e8d0da2079eb3aa1869ff360414d5738/src/main.cjs#L390)
- [`src/main.cjs` line 399](https://github.com/zoobookfool/selfmatrix-desktop/blob/be1e9aa5e8d0da2079eb3aa1869ff360414d5738/src/main.cjs#L399)

同じローカル origin では cinny だけでなく `/ec/`、`/public/element-call/`、`/desktop-shell.html` も配信している。mainWindow は `shell-preload.cjs` を持ち `sandbox:false` なので、EC や harness の document へ top-level 遷移できると、本来 mainWindow で動かす想定ではないページに bridge が再注入される。

Recommended fix:

- mainWindow の top-level navigation は cinny の document だけ許可する。
- 少なくとも `/ec/`, `/public/element-call/`, `/desktop-shell.html`, `/vendor/` への document 遷移は block する。
- subresource 配信は `will-navigate` とは別なので、document ナビゲーションだけを絞る実装でよい。

### [P2] `native-milestones.md` の M1 完了注記が、解消済み未検証をまだ残している

`native-milestones.md` の M1 完了注記では、bounds 同期と 7 語彙 production 配線が未検証として残っている。

- [`planning/native-milestones.md` line 103](../planning/native-milestones.md#L103)
- [`planning/native-milestones.md` line 108](../planning/native-milestones.md#L108)
- [`planning/native-milestones.md` line 133](../planning/native-milestones.md#L133)

同じ文書の M2 セクションでは boundsSync は完了扱いで、E2E 側にも `realClickVocabulary` が入っている。歴史的な注記として残すなら問題ないが、「現時点の未検証」と読める状態は避けたい。

Recommended fix:

- M1 注記を「当時の全体レビュー指摘」に降格する。
- 完了済みと残りを分けて、M2 の現在タスクだけが未完了に見えるようにする。

### [P2] 製品 repo に prototype 名がまだ残っている

製品 repo 化後も、いくつかの識別子・タイトルに prototype 名が残っている。

- [`src/widget-bridge-protocol.cjs` line 5](https://github.com/zoobookfool/selfmatrix-desktop/blob/be1e9aa5e8d0da2079eb3aa1869ff360414d5738/src/widget-bridge-protocol.cjs#L5)
- [`src/main.cjs` line 57](https://github.com/zoobookfool/selfmatrix-desktop/blob/be1e9aa5e8d0da2079eb3aa1869ff360414d5738/src/main.cjs#L57)
- [`src/main.cjs` line 445](https://github.com/zoobookfool/selfmatrix-desktop/blob/be1e9aa5e8d0da2079eb3aa1869ff360414d5738/src/main.cjs#L445)

即時に壊れるものではないが、製品 repo の信頼性と将来の状態移行を考えると、M2 初期で整理しておく方がよい。

Recommended fix:

- `selfmatrix-native-prototype-call` を製品名ベースの widget id / partition name へ改名する。
- `SelfMatrix Native Prototype` の window title を `SelfMatrix` へ変更する。
- E2E が旧名に依存していないか確認する。

## ClaudeCode handoff

1. `selfmatrix-desktop` の通常起動を cinny top-frame に変更し、harness を明示フラグへ退避する。
2. mainWindow の navigation allow-list を origin だけでなく document path まで絞る。
3. prototype 名の残りを製品名へ整理する。
4. `planning/current-status.md` / `planning/backlog.md` / `planning/native-milestones.md` を M2 開始後の現在地に更新する。
5. 上記のうち P1 だけでも先に直し、`npm test` と可能なら `npm run e2e:join` を `selfmatrix-desktop` 側で再実行する。

## Positive notes

- `realClickVocabulary` と `callRespawn` の E2E 補強は、前回 GPT/Fable 指摘に対してかなり良い方向。
- `boundsSync` は cinny 実レイアウト追従まで確認する形になっており、M3 のポップアウト UX 検討へ進める材料として強い。
- `selfmatrix-desktop` の sibling path 化により、公開 repo として個人パス依存はかなり減っている。
