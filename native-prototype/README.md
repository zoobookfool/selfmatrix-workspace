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
- call view preload に移設した最小 `CallControl` 相当 (`src/call-control-preload.cjs`) を、host
  (shell) から correlationId 方式の RPC (`native:call-control:invoke`) で駆動し、EC 内の実 DOM
  クリック → 属性変化 → `MutationObserver` push の一連を実証する (M1 step 2。詳細は下記節)
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

## NativeCallControl 相当の DOM 移設 (M1 step 2)

web 版 cinny の `CallControl.ts` は iframe の `contentDocument` に対する `querySelector` /
`.click()` / `MutationObserver` で screenshare/spotlight/emphasis/reactions/settings を操作する。
WebContentsView は host から DOM に触れないため、このロジックを call view 側 preload
(`src/call-control-preload.cjs`) へ移設し、host からは IPC RPC で駆動する構成を最小 (1 コントロール)
で実証した (design/native-widget-transport.md §2.2, §3 step 2)。

- **対象コントロールの選定**: この prototype はバックエンド無しのため、EC は在室通話 UI ではなく
  `ErrorView.tsx` (`Room not found. The widget-api did not pass over the relevant room
  events/information.`) を描画し、ロビー (マイク/カメラトグル) には到達しない。さらに
  `CallControl.ts` を精読すると、そもそも `toggleMicrophone`/`toggleVideo` は DOM クリックではなく
  widget action (`ElementWidgetActions.DeviceMute` 経由の `transport.send()`) で実装されており、
  querySelector/.click() が使われるのは screenshare/spotlight/grid/emphasis/reactions/settings 側
  だけだった。そのため対象には、この環境で実在する唯一の操作可能コントロール (`ErrorView.tsx` の
  CloseWidgetButton, `[role="button"][data-kind="primary"]`, data-testid 無し) を選んだ。このボタン
  自身の属性は EC 側では click しても変化しない (host が `io.element.close` を処理しないため) ので、
  実クリックイベントを起点に preload が `data-selfmatrix-pressed` 属性を独自にトグルして観測対象に
  した。詳細な逸脱の記録は `src/call-control-preload.cjs` 冒頭コメントと
  `evidence/call-control-result.json` の `deviationsFromDesign` を参照。
  **step 3 引き継ぎ注意**: web 版 `CallControl.ts` では spotlight/emphasis は `<input>` の
  checkbox/radio で、実際に見るべき `checked` は DOM 属性ではなくプロパティのため、属性ベースの
  `MutationObserver` (`observe()`, 本 preload の実装方式) では変化を拾えない。`CallControl.ts` は
  click 直後に `refreshEmphasisState()` で明示的に状態を再読込することでこれに対処している。step 3 で
  対象をこれらのコントロールに差し替える際は、同様の対策 (click 後の明示再読取り、または `checked`
  プロパティの polling) が必要 — 属性 MutationObserver をそのまま流用すると `statePushSeen` が
  常に false になる。
- **preload の分離方法**: 当初は `widget-bridge-preload.cjs` から `require("./call-control-preload.cjs")`
  する設計を想定していたが、call view は `sandbox: true` で動いており、実測したところ sandbox 下の
  preload の `require()` は `"electron"` 以外 (node: 組み込みモジュール、相対パスの自前ファイル、
  `__dirname` すら) を解決できないことが分かった (`Error: module not found: path` 等)。そのため
  `call-control-preload.cjs` は `main.cjs` の `ensureCallView()` が
  `session.fromPartition(CALL_VIEW_PARTITION).registerPreloadScript({ filePath, type: "frame" })` で
  同じフレームの 2 本目の preload として登録する方式にした。ファイルとしての分離は保たれる。
- **RPC 経路**: shell (`window.selfmatrixWidgetHost.callControlToggle()`) → 内部で
  `claimWidgetTransport()` が払い出した `callControlInvoke("toggleTarget")` (`ipcRenderer.invoke`) →
  main (`ipcMain.handle("native:call-control:invoke")`, correlationId を発行して相関) → call view
  (`native:call-control:invoke` → `invoke()` 実行 → `native:call-control:invoke-result`) → main が
  correlationId で resolve → shell。MutationObserver 由来の state push は
  `native:call-control:state` で main を経由し shell へも中継される。main は action の意味を一切
  解釈しない中継役に徹する (design §2.2)。**F7 (受け入れレビュー修正)**: `callControlInvoke` は
  当初 `selfmatrixNative` に常時公開していたが、これは F2b の `claimWidgetTransport()` claim-once が
  塞いだ「同一オリジン iframe (cinny 埋め込み) から `window.parent` 経由で送信 API に触れられる」経路を
  この新チャンネルで再発させていた。送信 API と同じ claim-once の対象に統合し、host 側は
  `shell-widget-host.js` が公開する `window.selfmatrixWidgetHost.callControlToggle()` (引数を取らず
  対象アクションを固定した安全なラッパー) 経由でのみ叩く。`desktop-shell.js` の手動ボタンもこれに
  追随済み。
- **smoke への組み込みと pass 条件** (`npm run smoke` / `evidence/call-control-result.json`,
  `evidence/smoke-result.json` の `callControl` フィールド):
  - `rpcRoundTrip`: shell→main→callView→main→shell の往復が correlationId 相関込みで完走したこと
  - `domChanged`: 対象要素の `data-selfmatrix-pressed` 属性がクリック前後で実際に変化したこと
    (実測値を `before`/`after` に記録)
  - `statePushSeen`: MutationObserver 由来の state push (`reason: "mutation-observed"`) が main まで
    届いたこと
  - `realClickConfirmed` (F6, 受け入れレビュー修正): 上記 2 つは preload 自身が付ける合成属性
    `data-selfmatrix-pressed` の自己完結観測に過ぎず、`target.click()` を「属性を直接トグルするだけの
    コード」に置き換える回帰が入っても検知できない。そのため、invoke 実行後に EC (ErrorView の
    CloseWidgetButton) が実際に送信した `io.element.close` (from-view、検証を通過し受理されたもの。
    `widget-message-rejected` は数えない) の出現を、実クリックが EC 本体の DOM に届いたことの独立した
    傍証として pass 条件に AND で組み込んでいる。**これは step 2 の対象 (ErrorView の
    CloseWidgetButton) に固有の傍証であり、step 3 で対象を実コントロールに差し替える際は、対応する
    独立シグナル (その対象が実際に送信する widget action や DOM 状態変化など) に置き換えること。**
  - 4 つとも独立した変異観点に対応する (`main.cjs` の `analyzeCallControl()` コメント参照)。
    「クリック処理の no-op 化」「RPC 中継の破壊」「MutationObserver 登録の削除」「state 素通しの破壊」
    の 4 変異を個別に適用 → `npm test` が FAIL することを実測 → 復元、という手順で確認した記録が
    受け入れレビュー記録 `reviews/claude-review-m1-step2-20260707.md` (selfmatrix-workspace リポジトリ
    直下) にある (このリポジトリ単体では変異適用の実演は再現できないため、検証手順と結果はレビュー
    記録側の正本を参照すること)。

## まだやっていないこと

- Cinny 本体の widget host と深く統合すること
- 実 Matrix account / dev MatrixRTC / LiveKit join
- auto update / installer / release signing
- system audio / loopback の UX
