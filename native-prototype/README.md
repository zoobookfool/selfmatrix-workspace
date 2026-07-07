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
