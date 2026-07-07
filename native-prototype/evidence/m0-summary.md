# M0 Evidence Summary (2026-07-07)

M0 must-fix の証跡まとめ。詳細な一次出力は同じ `evidence/` 配下の JSON を参照する。

## Closed Must-Fix

- Widget protocol CLI は `native-prototype/src/main.cjs` の bridge 実装関数と
  `native-prototype/src/widget-bridge-preload.cjs` の実ファイルを VM 実行して検証する形へ変更。
- bridge は origin / widgetId を検証する。不一致は `origin_mismatch` / `widget_id_mismatch` で拒否。
- call view は `sandbox: true` に変更し、`native-prototype/evidence/smoke-result.json` で PASS。
- evidence JSON はコミット対象へ変更。
- `design/test-harness.md` の stale な未実施リストを更新。

## Electron Known Issues

- Electron #47247 / #44652 は、この prototype 条件では **再現せず**。
- `test-harness/electron-smoke/evidence/reparent-result.json` では 10 回の `WebContentsView` 再親子付け後も
  `loadCount=1`、`unloads=0`、WebRTC data channel `open`。
- `render-process-gone` は記録されていない。

## Memory Snapshot

`native-prototype/evidence/memory-result.json` に 3 点の working set / private bytes を記録した。

1. shell-only
2. call-view-booted
3. call-view-with-2-synthetic-viewer-streams

3 点目は call renderer 内に 2 本の local canvas capture stream を注入した synthetic 測定。
実 LiveKit decode / publish を伴う測定は M1 の real stack gate に残す。
