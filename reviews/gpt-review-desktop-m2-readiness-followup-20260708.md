# GPT Review: desktop M2 readiness follow-up (2026-07-08)

## Scope

- workspace: `zoobookfool/selfmatrix-workspace` `c57da2c3f4b2c80c7524b3a2ff1b5b32687f2375`
- desktop: `zoobookfool/selfmatrix-desktop` `0db93edbf8d74a9fe74db1ef33aa1fb53e78e60d`
- Follow-up review for the previous GPT M2 readiness findings.
- Tests were not run in this pass. The desktop commit message reports `npm test`, `e2e:join`, and `e2e:callflow` all green.

## Summary

The previous P1/P2 implementation items are materially addressed:

- Default desktop launch now uses the cinny top-frame production topology; harness is explicit (`--harness` / `npm run harness`).
- mainWindow navigation now blocks same-origin non-cinny document routes (`/ec/`, `/public/element-call/`, `/vendor/`, and `/desktop-shell.html` in production topology) and has a smoke regression for `/ec/`.
- The visible prototype names in desktop title / widget id / call-view partition were renamed.
- `current-status.md`, `backlog.md`, and the M1 completion note were mostly brought forward to the M2-started state.

No new P1 blocker was found in this static pass. The remaining issues are documentation precision problems: some "対応中 / 要承認 / 更新予定 / 未対処" wording still describes the pre-fix state.

## Findings

### [P2] M2 status docs still say the GPT readiness fix is "対応中" although the review index says all handled

`reviews/README.md` marks the previous GPT M2 readiness review as **全対応済み** with desktop `0db93ed`, but `planning/current-status.md` still says the mainWindow navigation/API exposure item is "GPT M2 readiness レビュー対応中".

- [`reviews/README.md` line 7](README.md#L7)
- [`planning/current-status.md` line 31](../planning/current-status.md#L31)

The likely intended state is:

- mainWindow navigation hardening from the GPT readiness review: handled by desktop `0db93ed`.
- shell API exposure cleanup (`getStatus` / `ensureCallView` / `detachCallView` / `attachCallView` still exposed from `shell-preload.cjs`): still a separate M2 security-audit item.

Recommended fix:

- Change `current-status.md` line 31 to split these two states, e.g. "mainWindow navigation は 0db93ed で暫定対応済み。shell API 露出面整理は M2 監査で継続".

### [P2] `native-milestones.md` still describes already-started M2 as "要運用者承認"

`native-milestones.md` correctly says selfmatrix-desktop has been created and pushed, but nearby heading/text still say "selfmatrix-desktop リポジトリ新設 — 要運用者承認".

- [`planning/native-milestones.md` line 75](../planning/native-milestones.md#L75)
- [`planning/native-milestones.md` line 76](../planning/native-milestones.md#L76)
- [`planning/native-milestones.md` line 111](../planning/native-milestones.md#L111)
- [`planning/native-milestones.md` line 116](../planning/native-milestones.md#L116)

This is no longer just cosmetic: `current-status.md` says M2 is started, while this section header still frames the same action as approval-gated.

Recommended fix:

- Rename the M2 heading to something like `M2: selfmatrix-desktop の製品化 (開始済み)`.
- Replace line 75's "更新予定" for the app-audio spike with "更新済み / OBS 再調査済み".
- Remove the "要運用者承認" wording around repository creation.

### [P2] `native-milestones.md` still says mainWindow navigation is "未対処"

The desktop fix now includes same-origin EC path blocking and a cinny-shell-smoke regression:

- desktop [`src/main.cjs` lines 522-533](https://github.com/zoobookfool/selfmatrix-desktop/blob/0db93edbf8d74a9fe74db1ef33aa1fb53e78e60d/src/main.cjs#L522-L533)
- desktop [`src/main.cjs` lines 2167-2196](https://github.com/zoobookfool/selfmatrix-desktop/blob/0db93edbf8d74a9fe74db1ef33aa1fb53e78e60d/src/main.cjs#L2167-L2196)

But `native-milestones.md` still says mainWindow is "未対処 (prototype で暫定対処予定)".

- [`planning/native-milestones.md` line 138](../planning/native-milestones.md#L138)
- [`planning/native-milestones.md` line 139](../planning/native-milestones.md#L139)

Recommended fix:

- Mark navigation confinement as `暫定対応済み (desktop 0db93ed, smoke regressionあり)`.
- Keep "shell API exposure / sandbox:false / claim-once contract整理" as the remaining M2 security-audit work.

## Notes

The desktop implementation choice to use a block-list rather than a strict cinny path allow-list is a reasonable interim compromise because cinny owns arbitrary SPA paths under `/`. The important high-risk same-origin document routes (`/ec/`, `/public/element-call/`, `/vendor/`, and production `/desktop-shell.html`) are now blocked.

The previous review body file `gpt-review-desktop-m2-readiness-20260708.md` should be committed together with this follow-up if it is not already tracked; `reviews/README.md` links to it.
