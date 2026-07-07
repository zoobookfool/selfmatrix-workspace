# SelfMatrix Native Prototype

Electron 版 SelfMatrix の最小 prototype です。
production 実装ではなく、`native-client-rethink.md` の案 A/B を小さく動かすための足場です。

## できること

- Cinny build artifact と Element Call build artifact を同一 local origin で配信する
- Shell window で Cinny を iframe 表示する
- Element Call を iframe ではなく `WebContentsView` として起動する
- Shell window の通常ページスクリプト (`src/shell-widget-host.js`) で本物の
  `matrix-widget-api` `ClientWidgetApi` を起動し、iframe シム + IPC 素通しルータ経由で実 EC dist と
  `supported_api_versions` → capabilities 交渉 → `content_loaded` のハンドシェイクを本物の応答で
  やり取りする (M1 step 1。詳細は `../design/native-widget-transport.md` §2.1)。応答はもうスタブ
  ではない — `main.cjs` は `native:widget-to-view` / `native:widget-from-view` の 2 チャンネルを
  素通しするだけの薄いルータ
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

## widget-api トランスポート (M1 step 1)

`matrix-widget-api` を pinned dependency として追加している (`cinny/node_modules/matrix-widget-api`
と同一バージョンに固定)。`ClientWidgetApi` は preload ではなく `desktop-shell.html` の通常の
`<script>` (`src/shell-widget-host.js`) で動く — 理由と本番 cinny との構成差は同ファイル冒頭の
コメントを参照。iframe は実在しないため `{contentWindow:{postMessage}, addEventListener,
removeEventListener}` の最小シムを渡す。`driver.validateCapabilities()` は要求された capability を
そのまま全承認する (ハンドシェイク検証用。個別可否判定は未実装)。

main.cjs は通話 1 本につき `native:widget-to-view` (shell→callView) と `native:widget-from-view`
(callView→shell) の 2 チャンネルを素通し中継するだけで、Widget API メッセージの解釈や応答生成は
一切しない。`native:widget-from-view` (call view からの受信) には M0 由来の
`validateWidgetBridgeMessage` (origin / widgetId / `sourceIsSelf===true`) を、`native:widget-to-view`
(shell からの送信) には F2a (受け入れレビュー修正) で追加した `validateToViewMessage`
(widgetId / api 方向) を適用し、拒否されたメッセージは転送しない。送信 API 自体も F2b で
`claimWidgetTransport()` による claim-once 化 (初回呼び出しのみ有効) をしている
(詳細は `src/shell-preload.cjs` / `src/shell-widget-host.js` のコメント参照)。

`npm run smoke` は `evidence/handshake-result.json` に、応答が本物の `ClientWidgetApi`
由来であること (`supported_api_versions` の応答が非空 — 除去済みスタブは常に空配列を返していた)
と capability 交渉が (要求 → driver 承認 → notify) まで往復したこと、加えて
ハンドシェイク完了後に注入したスプーフメッセージが確実に拒否されること (`spoofRejected` /
`spoofLeaked` / `unexpectedRejectedCount`) と claim-once ガードが機能していること
(`claimGuard`) を記録する。

## まだやっていないこと

- Cinny 本体の widget host と深く統合すること
- 実 Matrix account / dev MatrixRTC / LiveKit join
- auto update / installer / release signing
- system audio / loopback の UX
