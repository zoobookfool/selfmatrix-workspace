# SelfMatrix Native Prototype

Electron 版 SelfMatrix の最小 prototype です。
production 実装ではなく、`native-client-rethink.md` の案 A/B を小さく動かすための足場です。

## できること

- Cinny build artifact と Element Call build artifact を同一 local origin で配信する
- Shell window で Cinny を iframe 表示する (既定の harness モード)、または cinny 本体を
  トップフレームで直接ロードする (`--cinny-shell`、本番同様の topology。M1 step 3b。下記節参照)
- Element Call を iframe ではなく `WebContentsView` として起動する
- Shell window の通常ページスクリプト (`src/shell-widget-host.js`) で本物の
  `matrix-widget-api` `ClientWidgetApi` を起動し、iframe シム + IPC 素通しルータ経由で実 EC dist と
  `supported_api_versions` → capabilities 交渉 → `content_loaded` のハンドシェイクを本物の応答で
  やり取りする (M1 step 1。詳細は `../design/native-widget-transport.md` §2.1)。応答はもうスタブ
  ではない — `main.cjs` は `native:widget-to-view` / `native:widget-from-view` の 2 チャンネルを
  素通しするだけの薄いルータ
- call view preload に移設した `CallControl` 相当 (`src/call-control-preload.cjs`) を、host (shell)
  から correlationId 方式の RPC (`native:call-control:invoke`) で駆動する。M1 step 2 は単体実証用の
  `toggleTarget` 1 action のみだったが、M1 step 3b で cinny の `NativeCallControlAction` 契約 7 種
  (`toggleScreenshare`/`toggleSpotlight`/`toggleEmphasis`/`toggleReactions`/`toggleSettings`/
  `setSoundOn`/`setSoundOff`) を実装した (詳細は下記節)
- 通話 View の起動/終了は URL 駆動の `openCallView(completeWidgetUrl)`/`closeCallView()` (claim
  済みトランスポート経由、M1 step 3b) — cinny 本体が組み立てる完成 URL をシェルが検証してから
  ロードする
- 通話 view を main window と call window の間で再親子付けする
- Electron の `setDisplayMediaRequestHandler` を登録する
- Windows では `getDisplayMedia({ audio: true })` に `loopback` audio を返す

## 実行

通常起動 (harness モード。desktop-shell.html + cinny iframe):

```powershell
npm install
npm start
```

cinny トップフレームモード (M1 step 3b。cinny 本体を直接ロードする、本番同様の topology):

```powershell
npm run cinny-shell
```

smoke (harness モード):

```powershell
npm run smoke
```

memory probe (harness モード):

```powershell
npm run memory
```

cinny-shell smoke (M1 step 3b。下記節参照):

```powershell
npm run cinny-shell-smoke
```

test (smoke + memory + cinny-shell-smoke を束ねたもの):

```powershell
npm test
```

`npm test` は Electron の実起動 (smoke + memory probe + cinny-shell smoke) が必要です。Electron を
起動できない環境 (headless CI で xvfb 等の準備がない場合など) では失敗します。

## 同一オリジン不変条件

Cinny shell (`desktop-shell.html`) と Element Call widget (`/ec/index.html`) は**同一 origin
で配信すること**が前提です。Element Call 実物は `parentUrl` の origin を widget message の
`targetOrigin` に使うため、shell と call view が別 origin だと `postMessage` が届きません
(検証経緯は [desktop-window-spike.md](../spikes/desktop-window-spike.md) Phase 2b を参照)。

この不変条件は起動時の assert で保証されています。`src/widget-bridge-protocol.cjs` の
`buildWidgetUrl()` が call URL を組み立てる際に必ず `assertSameOrigin()` を呼び、
`buildLocalCallUrl()` (`src/main.cjs`、harness/smoke 用の既定 widget パラメータで完成 URL を
組み立てるヘルパー。旧 `ecUrl()` を M1 step 3b で汎用化・改名した) はこの `buildWidgetUrl()` への
薄い委譲です。origin が不一致だと `buildWidgetUrl()` が例外を投げてアプリの起動に失敗します —
実際にこの経路を通して不一致を検証するテストは `test-harness/cli/widget-protocol.mjs` の
`bridge-origin-mismatch` シナリオにあります。M1 step 3b 以降は、cinny/harness が実際に渡す URL
(通話 View ロード時) も `openCallView()` の `validateCallViewUrl()` で改めて同一オリジン + EC dist
の既知 base 配下であることを検証する (下記「cinny の nativeBridge.ts 契約への適合」節参照) —
こちらは起動時の assert とは別に、通話ごとの URL 受け渡し (main プロセス↔レンダラの信頼境界) を
守るための検証。

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
  `call-control-preload.cjs` は `main.cjs` の `createCallViewIfNeeded()` (M1 step 3b で
  `ensureCallView()` から改名。役割は同じ: WebContentsView の生成のみ担う) が
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

## cinny の nativeBridge.ts 契約への適合 (M1 step 3b)

M1 step 3a で cinny fork (`spike/native-shell` ブランチ) に実装された `window.selfmatrixNative`
契約 (`cinny/src/app/plugins/call/native/nativeBridge.ts`) に、シェル側 (このリポジトリ) を
合わせた。詳細は `../design/native-widget-transport.md` の「step 3b 実装要件」節。

### 契約の最終形

`claimWidgetTransport()` (`src/shell-preload.cjs`) が通話 1 本につき 1 回だけ払い出すオブジェクト:

| メソッド | 役割 | main.cjs 側の実体 |
| --- | --- | --- |
| `sendToView(message)` | host→view の widget-api 素通し送信 | `native:widget-to-view` |
| `openCallView(completeWidgetUrl)` | 完成 URL を検証してから通話 View をロード | `native:open-call-view` → `openCallView()` |
| `closeCallView()` | 通話 View を閉じる | `native:close-call-view` → `closeCallView()` |
| `callControlInvoke(action)` | カテゴリ B (画面共有等) の RPC | `native:call-control:invoke` (既存) |
| `onCallControlState(listener)` | state push の購読 (新設) | `native:call-control:state` (既存の中継を購読可能にした) |

旧契約 (`sendToView, notifyWidgetHostReady, callControlInvoke`) との差分:

- `notifyWidgetHostReady` は廃止。`new ClientWidgetApi(...)` (`message` リスナー登録を同期完了) の
  直後に呼び出し元が `openCallView()` を呼ぶ、という順序そのものが安全性を保証するため、別チャンネル
  での合図待ちが不要になった (`main.cjs` の `state.widgetHostReady` 待機ロジックも撤去済み)。
- 静的な `ensureCallView()`/`/widget-config.json` 方式は、URL 駆動の `openCallView(url)` に統合。
  `window.selfmatrixNative.ensureCallView()` (claim 不要、常時公開) は「create-only ガード」として
  残っている — harness の detach/attach デモや `sendWidgetActionFromShell()` の F3 対策が使う。

### openCallView() の URL 検証

cinny レンダラ (相対的に低信頼) が組み立てた URL を `main.cjs` は無検証で `loadURL` しない。
`widget-bridge-protocol.cjs` の `validateCallViewUrl()` が (a) 同一オリジンであること、(b) EC dist の
既知 base (`EC_BASE_PATHS = ["/ec/", "/public/element-call/"]`) 配下の pathname であることを検証する。
不合格なら `openCallView()` は例外を投げて claim 済みトランスポート越しの Promise を reject させ、
`{type:"call-view-url-rejected", url, validation}` を `widgetMessages` に記録する — call view は
生成すらされない (`createCallViewIfNeeded()` の手前で弾く)。

### `/public/element-call/` エイリアス route

cinny の `CallEmbed.ts`/`NativeCallEmbed.ts` は無改造では `<origin>/public/element-call/index.html`
(web 版と同じ base) で完成 URL を組み立てる。シェルの静的サーバはこの path も EC dist へエイリアス
する (`main.cjs` の `startServer()`)。既存の `/ec/` (M0/M1 step 1-2 由来、test-harness の
`bridge-origin-mismatch` シナリオ等が前提にしている) はそのまま残してあり、両方が
`validateCallViewUrl()` の許可 prefix。

### `--cinny-shell` / `--cinny-shell-smoke` (トップフレームモード)

```powershell
npm run cinny-shell         # 対話モード: mainWindow が desktop-shell.html ではなく <origin>/cinny/ を直接ロード
npm run cinny-shell-smoke   # 自動判定版 (npm test に組み込み済み)
```

既定/`--smoke`/`--memory-probe` の harness トポロジ (desktop-shell.html + cinny を iframe 埋め込み)
はそのまま維持している。`--cinny-shell`(-smoke) は cinny 本体をトップフレームでロードする、本番
同様の topology。`cinny-shell-smoke` はバックエンド無し環境で検証できる範囲のゲートを自動判定する
(`evidence/cinny-shell-result.json`):

- **bridgePresent / cinnyTopFrame**: cinny が top frame でロード完了し `window.selfmatrixNative` が
  main world に存在すること。
- **claimGuard**: 2 回目の `claimWidgetTransport()` が throw すること。
- **urlValidationGate**: 悪性 URL 2 種 (別オリジン / EC base 外の同一オリジン path) それぞれについて、
  `openCallView()` が reject され、`call-view-url-rejected` が記録され、call view が生成されず
  (`state.callView === null`)、当該 URL への navigation も一切発生しないこと (4 条件の AND)。
- **validOpenCallView**: `/public/element-call/` エイリアス経由 (`/ec/` ではなくこちらを使うのは、
  エイリアス route を削除する変異にもこのテストが反応するようにするため) の正当な URL で
  `openCallView()` が resolve し、EC からの `content_loaded` (from-view) が main に到達すること。
- **onCallControlStateWiring**: `toggleTarget` (ErrorView の CloseWidgetButton、単体実証用の action —
  実 in-call UI が無いこの環境で唯一実在する操作可能ターゲット) を invoke し、call view preload の
  MutationObserver push が main を経由して shell 窓の `onCallControlState` 購読リスナーまで実際に
  届くこと。

この smoke は cinny 自身がバックエンド無しでログイン画面より先に進めないため、
「`NativeCallEmbed` が本来やるはずのこと」(claim + 本物の `ClientWidgetApi` 構築) を
`runCinnyShellSmoke()` が `executeJavaScript` 経由で代わりに行う (`main.cjs` 冒頭コメント参照)。
`ClientWidgetApi` を構築しないと EC からの `supported_api_versions`/`capabilities` リクエストに
誰も応答せず、EC がローディング画面のまま進行しなくなることを実測で確認した。

### call-control 語彙の拡張 (`src/call-control-preload.cjs`)

cinny の `NativeCallControlAction` 契約 7 種 (`toggleScreenshare`/`toggleSpotlight`/
`toggleEmphasis`/`toggleReactions`/`toggleSettings`/`setSoundOn`/`setSoundOff`) を、web 版
`CallControl.ts` の実セレクタ (`[data-testid="incall_screenshare"]` 等) をそのまま移植して実装した。
この prototype 環境では実 in-call UI が無い (EC は ErrorView を描画する) ため、各 action は対象が
見つからず `{ok:false, reason:"target_not_found"}` を返す — 例外にはしない (design の要件どおり)。
spotlight/emphasis の `checked` は DOM 属性ではなくプロパティのため、属性ベースの
`MutationObserver` だけでは変化を拾えない。各 handler は click 直後に明示的に現在の DOM 状態を
再読取りして `native:call-control:state` へ push する (`CallControl.ts` の `refreshEmphasisState()`
と同じ対策)。M1 step 2 の単体実証用 `toggleTarget` action (ErrorView の CloseWidgetButton) は
smoke 互換のためそのまま残っており、実コントロール 7 種とは独立したコードパス。

### onCallControlState の状態 push (cinny 側の再同期)

cinny 側 (`NativeCallControl.ts`) は M1 step 3a では自分のクリック成功時のみ状態更新する楽観的
実装だった (実 DOM とズレても補正されない)。M1 step 3b で `transport.onCallControlState()` を
購読し、call view preload からの push を受けて `screenshare`/`spotlight`/`emphasis` を実状態に
再同期するようにした。push は plain object の duck typing (`NativeCallControlStatePush`) —
どのフィールドが実際に入っているかで安全にマージ可否を判定するため、無関係な push
(例: `toggleTarget` の push 形状) が届いても無視される。

## E2E: 実ログイン→実 LiveKit join (M1 step 3c-1)

`native-prototype/e2e/native-join.e2e.mjs` は、ここまでの smoke/cinny-shell-smoke (すべて
バックエンド無し前提) とは違い、**本物のローカル dev Matrix/LiveKit スタックが起動している
こと**を前提に、cinny の実ログイン画面から実際に LiveKit へ join するところまでを
playwright-core の `_electron` API で自動操作し、実測する。**`npm test` には含まれない** —
バックエンドが無い環境では動かせないため、独立した `npm run e2e:join` として切り出してある
(バックエンド未起動時は明確なエラーで fail し、偽 PASS は返さない)。

### 実行手順

1. ローカル dev Matrix/LiveKit スタックを起動する (`element-call` ディレクトリで
   `pnpm backend`、Docker が必要)。`https://synapse.m.localhost/.well-known/matrix/client` の
   `org.matrix.msc4143.rtc_foci` が引ければ準備完了。
2. `element-call` ディレクトリで `pnpm install` 済みであること (このスクリプトは
   `playwright-core` を native-prototype 自身の依存に追加せず、`element-call` の pnpm store
   から glob 解決で借用する)。
3. dev ユーザー (既定は alice) のパスワードを環境変数で渡す。**パスワードをファイルやコマンド
   履歴に残る形で書かないこと** — 実行するシェルのその場限りの環境変数として渡す。

   ```powershell
   $env:SELFMATRIX_E2E_PASSWORD_ALICE = "..."
   npm run e2e:join
   ```

4. 終了コード 0/1 で pass/fail が分かる。証跡は `evidence/native-join-result.json`
   (パスワード・個人絶対パスを含まないようサニタイズ済み。OpenID access_token も念のため
   redact 済み) と、スクリーンショット 2 枚:
   - `evidence/native-join.png` — mainWindow (cinny) 自身の見た目。cinny の Discord 風通話
     コントロールバーや「通話中 1 人」表示は写るが、`BrowserWindow.capturePage()` は
     `addChildView()` された call view (別 WebContentsView) を合成しない (実測) ため、
     Element Call 自体の中身はここには写らない。
   - `evidence/native-join-callview.png` — call view (Element Call) 自身を個別に
     `webContents.capturePage()` した画像。実際の in-call UI (参加者タイル、マイク/退出
     ボタン等) が写る。

### pass 条件

- `bridgeDetected`: cinny 側で `NativeCallEmbed` 経路に入り、`openCallView()` が URL 検証を
  通過して call view がロードされたこと。
- `realJoinObserved`: EC (widget) から `io.element.join` (fromWidget) が実際に main へ届いたこと。
- `inCallUi`: EC の DOM に `[data-testid="incall_leave"]` が出現したこと。
- `livekitConnected`: call view の dom-ready 時に注入した `RTCPeerConnection` ラッパ経由で、
  少なくとも 1 接続が `connected`/`completed` に到達したこと (`window.__selfmatrixPcs`)。

### 環境専用フラグ (`--e2e-real-join`)

`main.cjs` は `--e2e-real-join` (Playwright が Electron 起動時に渡す) を見たときだけ、
**dev/E2E 専用**の Chromium switch を 3 つ appendSwitch する:
`ignore-certificate-errors` (dev CA 用)、`use-fake-ui-for-media-stream` /
`use-fake-device-for-media-stream` (実オーディオデバイスを絶対に使わないため)、
`host-resolver-rules=MAP *.m.localhost 127.0.0.1` (この開発機の OS リゾルバが
`*.m.localhost` の多段サブドメインを解決できないため、Chromium 側にも明示マップする)。
同フラグはさらに call view の dom-ready 時に RTCPeerConnection 監視ラッパを注入し、
`global.__selfmatrixE2E` (main プロセスの `state` への窓口) を有効にする。
これらは常に `isE2ERealJoin` でガードされており、通常起動では絶対に有効化されない。

### 実装にあたって見つけた/直した既存バグ

E2E を実際に通す過程で、smoke/cinny-shell-smoke (バックエンド無し) では顕在化しなかった
4 つの実バグが見つかったため、あわせて修正した (native-prototype 自身のコードのみ。
cinny 側のソースは一切変更していない):

1. **`.wasm` の Content-Type 欠落**: 静的サーバの `contentType()` が `.wasm` を
   知らず `application/octet-stream` を返していた。matrix-js-sdk の rust crypto は
   `WebAssembly.compileStreaming()` で読み込むため MIME type が厳密に `application/wasm`
   でないと失敗し、cinny がログイン後ずっと「起動中です」のまま進行しなくなっていた。
2. **`--cinny-shell` の path prefix と cinny の router basename の不一致**: cinny の
   React Router は `build.config.ts` の `base:'/'` により basename `"/"` で組み立てられて
   おり、オリジンのルートを自分が占有する前提でルーティングする。以前は mainWindow を
   `${origin}/cinny/` (パスプレフィックス付き) でロードしていたため、cinny のルータが
   実際の pathname (`/cinny/lobby` 等) をそのまま解釈し、"cinny" を `:spaceIdOrAlias`
   パラメータとして誤マッチさせ、存在しない space の lobby に迷い込んでいた。
   `--cinny-shell` モードでは `"/"` 自体を cinny の `index.html` として配信し、
   mainWindow も `${origin}/` をロードするよう変更した (harness モードの `/cinny/` iframe
   埋め込みはそのまま維持)。
3. **cinny のルートアセット 404**: 上の base:'/' 前提により、`/assets/*.js` /
   `/config.json` / `/sw.js` / `/public/locales/*.json` 等がサイトルート相対の絶対パスで
   参照される。既知の他ルートに一致しないリクエストは cinny dist へのフォールバックとして
   ルート相対でも配信するようにした (`/ec/`, `/public/element-call/` をシャドーしないよう、
   その 2 つは先に判定してから 404 させている)。
4. **widget-api の widgetId 固定値ミスマッチ**: `native:widget-to-view` /
   `native:widget-from-view` の検証が、常に prototype 合成 widget 専用の固定 `WIDGET_ID`
   とだけ照合していた。cinny 本体の実 widget (`CallEmbed.getWidget()` が生成する
   `widgetId: 'call-embed'`) はこれと一致しないため、ハンドシェイクが全滅していた。
   `openCallView()` が検証済み URL から実際の widgetId を読み取り、その通話中はそちらと
   照合するようにした (`state.activeWidgetId`)。既存の smoke/cinny-shell-smoke は元から
   固定 `WIDGET_ID` の URL しか使わないため挙動は変わらない。

## E2E: 2 ユーザー通話 + 配信 + 窓移動無再接続 + 7 語彙実 DOM 検証 (M1 step 3c-2/3c-3)

`native-prototype/e2e/native-callflow.e2e.mjs` は M1 step 3c-1 (`native-join.e2e.mjs`、alice 1 人の
実ログイン→実 LiveKit join) の先を検証する、M1 受け入れ (案 B 正式 GO/NO-GO) の判定材料。
本物のローカル dev Matrix/LiveKit スタックが起動していることを前提に、playwright-core の
`_electron` API で prototype の Electron を **2 プロセス** (alice/bob それぞれ独立した
Electron インスタンス — HTTP サーバは各プロセスがポート 0 バインドするため衝突しない) 実起動する。
alice・bob 共通のログイン/モーダル片付け/ルーム参加/main プロセス内部状態読み取りロジックは
`e2e/lib/nativeE2ELib.mjs` に集約されている (`native-join.e2e.mjs` もこれを使うようリファクタ済み
— 単体動作・pass 条件・evidence 形状は不変)。**`npm test` には含まれない** —
`npm run e2e:callflow` として独立して実行する。

### 実行手順

`npm run e2e:join` (M1 step 3c-1) と同じ前提に加えて、dev ユーザー bob のパスワードも
環境変数で渡す。

```powershell
$env:SELFMATRIX_E2E_PASSWORD_ALICE = "..."
$env:SELFMATRIX_E2E_PASSWORD_BOB = "..."
npm run e2e:callflow
```

bob は Voice Lounge に (このワークスペースの dev バックエンドでは) 既に参加済みのため、
alice と同じ `openVoiceLoungeAndJoin()` ヘルパーで既存ルームを開くだけで参加できる。

終了コード 0/1 で pass/fail が分かる。証跡は `evidence/native-callflow-result.json`
(サニタイズ済み) と、スクリーンショット 3 枚 (`native-callflow-alice-2user-screenshare.png` —
2 ユーザータイル + 配信中、`native-callflow-bob-callview.png` — bob 視点 (配信を視聴 opt-in 後)、
`native-callflow-alice-detached.png` — 別窓移動中)。

### pass 条件 (全て AND)

- **alice/bob の実 join**: それぞれ `bridgeDetected`/`realJoinObserved`/`inCallUi`/
  `livekitConnected` (M1 step 3c-1 と同一の 4 条件)。
- **twoUserCallEstablished**: alice 側 EC の参加者タイル数 (`[data-testid="tile_pin"]`
  — 実機確認して判明: `MediaView.tsx` 自身の `data-testid="videoTile"` は `PinnableTile.tsx`
  経由でスプレッド展開により `tile_pin` に上書きされる) が 2 になること、かつ alice の
  inbound-rtp (audio) bytesReceived が増加すること。
- **localStorageContract**: cinny (mainWindow) と call view (別 session partition) 間の
  `matrix-setting-*` localStorage 契約の実機確認 (下記節参照)。
- **callControlVocabulary**: 7 語彙 (`toggleScreenshare`/`toggleSpotlight`/`toggleEmphasis`/
  `toggleReactions`/`toggleSettings`/`setSoundOff`/`setSoundOn`) を alice 側の claim 済み
  transport から `__selfmatrixE2E.invokeCallControl()` 経由で実行し、`{ok:true}` (`toggleReactions`
  のみ既知の環境ギャップ — 下記節参照) と、screenshare/spotlight/emphasis/sound については
  `onCallControlState` push が main 経由で shell 側購読者に届き、cinny 自身の DOM
  (`call_control_screenshare`/`call_layout_toggle`/`call_emphasis_toggle` の `aria-pressed`)
  にも反映されることを確認する。
- **bobWatchOptIn**: SelfMatrix の「視聴オプトイン」仕様 (`WatchableStreamsBar.tsx`) により
  bob が `[data-testid="watch_stream"]` を押して alice の配信を視聴 opt-in すること (下記節参照)。
- **windowMoveReparenting**: 配信中に通話 view を main window ⇔ 別ウィンドウ間で 3 往復
  再親子付けし、`noReload` (新規 RTCPeerConnection の生成ゼロ)・`pcStable` (往復前に connected
  だった PC が往復後も connected を維持)・`mediaContinues` (screenshare の outbound-rtp
  bytesSent と audio の inbound-rtp bytesReceived が往復前より増加)・`bobUnaffected`
  (bob 側の接続・in-call UI が維持) の全てが真であること。

### localStorage 契約の実機確認と修正 (M1 チェックリスト項目)

cinny (mainWindow) と call view (Element Call) は Electron の session partition が異なる
(`CALL_VIEW_PARTITION`)。**これは web 版で成立していた「cinny が書く `matrix-setting-*`
localStorage を EC が読む」契約 (`screenShareSettings.ts`/`miniTileStripSettings.ts` と
element-call `settings/settings.ts` の対応関係) が native では分離後も自動的には生きない**
ことを意味する (同一オリジンの iframe と違い、Electron の Storage はオリジンではなく
session partition 単位で分離されるため) — 実際に壊れていることを実測で確認した上で、
最小のブリッジを実装した:

1. cinny 側 (`nativeBridge.ts` の `collectNativeCallLocalStorageSnapshot()`) が
   `NativeCallEmbed` のコンストラクタで `matrix-setting-*` キーのスナップショットを集める。
2. `transport.openCallView(completeUrl, localStorageSnapshot)` (第 2 引数を新設) でシェルへ渡す。
3. シェル (`main.cjs` の `openCallView()`) は `state.pendingLocalStorageSnapshot` に置くだけで
   中身を解釈しない。
4. call view 側 preload (`call-control-preload.cjs` の `primeLocalStorageFromShell()`) が、
   EC のバンドル (`Setting` クラスのコンストラクタが localStorage を読むタイミング) より確実に
   前 — preload 自身のトップレベル評価時点 — に `native:get-pending-localstorage-snapshot`
   (sendSync) で同期的に取得し、`localStorage.setItem()` で書き込む。

**タイミングの注意 (実装時に踏んだ罠)**: スナップショットは `NativeCallEmbed` のコンストラクタ
(= cinny の「参加」ボタンを押した瞬間) で一度だけ取られる。テスト対象の値は **join する前**に
localStorage へ書き込んでおく必要がある — join 後に書き込んでも既に送信済みのスナップショットには
反映されない (`native-callflow.e2e.mjs` の `primeLocalStorageBeforeJoin()`/
`verifyLocalStorageContract()` 冒頭コメント参照)。

### 既知の環境ギャップ: `toggleReactions` (native 固有ではない)

この EC ビルド (`element-call/src/components/CallFooter.tsx`、SelfMatrix fork でリファクタ済み)
の footer には reactions 送信ボタン自体が描画されていない —
`FooterState.reactionData`/`reactionIdentifier` は型/state 層にしか存在せず、`CallFooter.tsx`
の JSX では一切参照されない (dead props と見られる)。web 版 `CallControl.ts` から移植した
`call-control-preload.cjs` の `reactionsButton()` (`leaveButton().previousElementSibling`)
は、実機確認したところ無関係な screenshare ラッパー `<div>` にヒットしていた — このコミットで
「クリック可能な要素 (BUTTON または role=button/switch) であることを確認できた場合のみ対象に
採用する」よう修正し、対象が無ければ正直に `target_not_found` を返すようにした。実クリック対象が
無い以上 `{ok:true}` にはなり得ないため、`toggleReactions` のみ「action 文字列が語彙として
認識されている (`unknown_action` ではない)」ことだけを pass 条件にしている。**この EC コンポーネント
は web 版とも共有されているため、native fork 固有の問題ではない。**

### 既知の環境ギャップ: `toggleSettings` の 2 回目クリックでは閉じない (native 固有ではない)

`element-call/src/settings/SettingsModal.tsx` の設定画面は Compound の `Dialog`
(`open`/`onDismiss` で制御) であり、web 版 `CallControl.ts`/cinny の `CallControls.tsx`
が前提にする「同じボタンを押すたびに開閉が反転する」トグル動作にはなっていない — 実機確認したところ
2 回目の `toggleSettings` invoke 後も `[role="dialog"]` が残っていた。`native-callflow.e2e.mjs`
は 7 語彙の契約どおり 2 回 invoke すること自体は行うが、テストの後始末は Dialog の標準的な閉じ方
(Escape キー) で行っている。

### 配信中の media 継続性の実測を安定させる対策 (`registerDisplayMediaHandler`)

実機確認で 2 つの罠が見つかり、あわせて対応した (どちらも `main.cjs` 自身のバグで、cinny 側の
ソースは変更していない):

- **`setDisplayMediaRequestHandler` の session partition 不一致**: 以前は
  `session.defaultSession` にしか登録しておらず、call view 自身の session
  (`CALL_VIEW_PARTITION`、mainWindow とは別物) で発生する実際の `getDisplayMedia()` 要求を
  カバーしていなかった。両方の session に登録するよう修正した。
- **静的な実画面キャプチャは E2E 環境ではほぼ即座にフレーム送出が止まる**: 自動操作中で実マウス/
  実画面の動きが乏しい dev マシンでは、素の実画面 (`screen:...` ソース) を掴むと screenshare 用
  content-adaptive エンコーダが「変化なし」を検知し、初回キーフレーム分だけで bytesSent が頭打ちに
  なる (SFU の需要ベース帯域制御としては正しい挙動だが、「media が流れ続けること」の E2E 実測には
  信号が消えてしまう)。cinny 自身の window (タイトルに `"SelfMatrix"` を含む) を実画面より優先して
  掴むようにし、`native-callflow.e2e.mjs` がその window 上に絶えず変化する keep-alive
  オーバーレイを描画することで、この問題を回避している。

## system audio (loopback) 実機確認 + アプリ単位音声キャプチャのスパイク (M1 step 3c-4)

M1 step 3c-4 の残り 2 項目 (native-milestones.md 参照)。詳細な調査結果・比較表・M2 要件化への
推奨は [spikes/app-audio-capture-spike.md](../spikes/app-audio-capture-spike.md) が正本。ここでは
追加した検証入口のみ記す。

- `npm run probe:system-audio` (`src/system-audio-probe.cjs` + `system-audio-probe.html`):
  `registerDisplayMediaHandler()` と同じ判定式 (`request.audioRequested && win32 ? "loopback" :
  false`) を単体の Electron スクリプトへ再現し、実ページの
  `getDisplayMedia({ video: true, audio: true })` が実際に audio track (`readyState: "live"`) を
  含む `MediaStream` を返すこと、その track を WebAudio `AnalyserNode` で 3 秒間サンプリングしても
  クラッシュしないことを実機確認する。evidence: `evidence/system-audio-result.json`
  (実測 pass:true — 詳細値は spike doc 参照)。`npm test` には含めない (音声デバイス依存のため)。
- `npm run probe:app-audio-capture` (`src/app-audio-capture-probe.cjs`): アプリ単位 (per-window/
  per-process) 音声キャプチャに相当する API が Electron 43 のこのビルドに隠れていないかを、
  `session.defaultSession` / `desktopCapturer` の実オブジェクトへのリフレクションと、実際の
  `desktopCapturer.getSources()` 呼び出し結果のフィールド形状で確認する。evidence:
  `evidence/app-audio-capture-api-surface-result.json` — 該当する API は見つからず、
  ドキュメントベースの結論 (Electron にはアプリ単位音声キャプチャの手段が無い) と整合した。
- 結論 (spike doc の要約): システム音声 (全体ミックス) は実機確認 PASS 済み。アプリ単位の音声は
  Electron 側に手段が無く、WASAPI Process Loopback のネイティブモジュール自作は工数 中〜大 —
  M2 では **LATER** を推奨。

## まだやっていないこと

- Cinny 本体の widget host と深く統合すること
- auto update / installer / release signing
- system audio / loopback の UX (トグル UI 自体。キャプチャ機構は上記で実機確認済み)
- アプリ単位の音声キャプチャ (上記スパイクの結論により当面 LATER)
