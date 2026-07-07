# SelfMatrix Native Prototype

Electron 版 SelfMatrix の最小 prototype です。
production 実装ではなく、`native-client-rethink.md` の案 A/B を小さく動かすための足場です。

## できること

- Cinny build artifact と Element Call build artifact を同一 local origin で配信する
- Shell window で Cinny を iframe 表示する
- Element Call を iframe ではなく `WebContentsView` として起動する
- `matrix-widget-api` の `fromWidget` message を preload/IPC bridge で受け、ack を返す
- 通話 view を main window と call window の間で再親子付けする
- Electron の `setDisplayMediaRequestHandler` を登録する
- Windows では `getDisplayMedia({ audio: true })` に `loopback` audio を返す

## 実行

通常起動:

```powershell
npm install
npm start
```

smoke:

```powershell
npm run smoke
```

memory probe:

```powershell
npm run memory
```

test (smoke + memory を束ねたもの):

```powershell
npm test
```

`npm test` は Electron の実起動 (smoke + memory probe) が必要です。Electron を起動できない
環境 (headless CI で xvfb 等の準備がない場合など) では失敗します。

## 同一オリジン不変条件

Cinny shell (`desktop-shell.html`) と Element Call widget (`/ec/index.html`) は**同一 origin
で配信すること**が前提です。Element Call 実物は `parentUrl` の origin を widget message の
`targetOrigin` に使うため、shell と call view が別 origin だと `postMessage` が届きません
(検証経緯は [desktop-window-spike.md](../spikes/desktop-window-spike.md) Phase 2b を参照)。

この不変条件は起動時の assert で保証されています。`src/widget-bridge-protocol.cjs` の
`buildWidgetUrl()` が call URL を組み立てる際に必ず `assertSameOrigin()` を呼び、`ecUrl()`
(`src/main.cjs`) はこの `buildWidgetUrl()` への薄い委譲です。origin が不一致だと
`buildWidgetUrl()` が例外を投げてアプリの起動に失敗します — 実際にこの経路を通して
不一致を検証するテストは `test-harness/cli/widget-protocol.mjs` の `bridge-origin-mismatch`
シナリオにあります。

ローカル artifact の場所は環境変数で上書きできます。

```powershell
$env:SELFMATRIX_CINNY_DIST="C:\path\to\cinny\dist"
$env:SELFMATRIX_EC_DIST="C:\path\to\element-call\dist"
npm start
```

既定では Windows の `Documents\DiscordSub\cinny\dist` と `Documents\DiscordSub\element-call\dist` を探します。

## まだやっていないこと

- Cinny 本体の widget host と深く統合すること
- 実 Matrix account / dev MatrixRTC / LiveKit join
- auto update / installer / release signing
- system audio / loopback の UX
