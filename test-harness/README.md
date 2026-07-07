# SelfMatrix Test Harness

SelfMatrix のネイティブ版に入る前段の検証入口です。
重い Electron 実機テストへ全部を押し込まず、Web UI / Widget protocol / Electron smoke を分けて確認します。

## Quick Start

依存なしで走る最小 smoke:

```powershell
npm test
```

Widget protocol CLI を個別に走らせる。CLI は `native-prototype/src/main.cjs` の bridge 実装関数と
`native-prototype/src/widget-bridge-preload.cjs` の実ファイルを VM 上で実行して検証します。

```powershell
npm run harness:widget -- --scenario preload-voice-join --write-transcripts
npm run harness:widget -- --scenario bridge-origin-mismatch
```

Web harness をブラウザで見る:

```powershell
npm run web:serve
```

Playwright / Electron smoke を走らせる場合は依存を入れてから実行します。

```powershell
npm install
npm run test:web
npm run smoke:electron:reparent
npm run smoke:electron:display-media
```

## 初期スコープ

- `cli/`: Matrix Widget API / bridge の action transcript を固定する
- `web/`: 配信タイル右クリックメニューと話者 overlay 右クリックメニューの UI harness
- `electron-smoke/`: `WebContentsView` 再親子付け、`displayMedia` constraints、Windows loopback audio の最小 Electron probe

## 注意

- 実 homeserver URL、アクセストークン、実アカウントは入れない
- `electron-smoke/evidence/*.json` と `artifacts/` は生成物として ignore する
- transcript は deterministic に生成し、契約の baseline として commit する
- Windows では `display-media` smoke が `audio: "loopback"` の audio track 取得まで確認する
