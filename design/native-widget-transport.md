# NativeWidgetTransport / NativeCallControl 設計 (M1)

**状態: 正本 (M1 設計)** — 2026-07-07 制定。[native-milestones.md](../planning/native-milestones.md) M1
「NativeWidgetTransport / NativeCallHost アダプタ」の設計文書。コード精読 (cinny `CallEmbed.ts` /
`CallWidgetDriver.ts` / `CallControl.ts`、`node_modules/matrix-widget-api` 実体、EC `widget.ts`) に
基づく。設計上の前提は prototype 検証 step 1 (後述) で実証してから確定する。

## 0. 結論サマリ

M1 の「アダプタ問題」は実際には**独立した 2 つの問題**に分解される。

| 系統 | 内容 | リスク | 解 |
| --- | --- | --- | --- |
| **(A) widget-api トランスポート** | `ClientWidgetApi` が iframe 前提 | **低** (依存が 2 行のみと判明) | iframe シム + IPC 素通しルータ。matrix-widget-api **無改造** |
| **(B) DOM コントロール** | `CallControl.ts` が iframe の `contentDocument` を直接操作 | **高** (WebContentsView は DOM 非公開で原理的に不成立) | ロジックを call view 側 preload へ移設し IPC RPC 化 |

(B) は当初の M1 記述に含まれていなかったが、見落とすと「join/hangup/mute は動くのに Phase 2b で
作った Discord 風コントロールバーが全滅する」形で座礁する。M1 スコープに明示的に含める。

## 1. 前提となる調査結果

### 1.1 ClientWidgetApi の iframe 依存は極小

`matrix-widget-api` の `ClientWidgetApi` コンストラクタが iframe に触れるのは実質 2 点のみ
(全 1950 行中、`iframe` の出現は計 4 行):

```js
if (!(iframe?.contentWindow)) throw new Error("No iframe supplied");  // truthy チェック
this.transport = new PostmessageTransport(
  WidgetApiDirection.ToWidget, widget.id,
  iframe.contentWindow,   // ← 送信先。要求されるのは .postMessage(msg, origin) だけ
  globalThis              // ← 受信元。常に host レンダラの実 window (差し替え不可)
);
iframe.addEventListener("load", ...);  // waitForIframeLoad=false (cinny 設定) なら実質無害
```

- **送信 (host→widget)**: `transportWindow.postMessage(message, targetOrigin)` を呼ぶだけ。
  → `postMessage` を持つ任意のオブジェクトで代替可能。
- **受信 (widget→host)**: `inboundWindow` は**常に `globalThis`** で固定。
  → widget からのメッセージ (fromWidget 要求・toWidget 応答) は、**cinny レンダラの実 `window` に
  本物の `message` イベントとして届ける必要がある**。これがネイティブ中継の設計制約。
- cinny は `waitForIframeLoad: false` で widget を作る (`CallEmbed.getWidget()`) ため、`'load'`
  イベント未発火の実害なし。capabilities 交渉の実トリガーは widget からの `content_loaded`
  action であり、transport 経由 = iframe 非依存。

### 1.2 CallWidgetDriver は無改造で流用可能

`CallWidgetDriver` の依存は `mx: MatrixClient` と `roomId` のみで iframe と完全に無関係。
実装済み: sendEvent (state/redaction 分岐) / sendDelayedEvent 系 (MSC4157) / sendToDevice
(暗号化バッチ) / readRoomTimeline / readRoomState / askOpenID / readEventRelations /
searchUserDirectory / getMediaConfig / uploadFile / downloadFile / getKnownRooms / processError。
`getTurnServers` 等の未実装は基底の既定挙動 (エラー応答) のままで、EC 側は非致命的に処理する
(既存 web 版と同じ挙動)。

### 1.3 cinny host 側は ClientWidgetApi の public API しか使っていない

`CallEmbed` が使うのは `call.transport.send()` / `setViewedRoomId()` / `feedEvent()` /
`feedStateUpdate()` / `feedToDevice()` / `on('action:...')` / `stop()` のみ。内部トランスポート
実装を一切知らないため、**iframe シムを渡せば cinny 側の widget-api まわりはほぼ無改造で動く**。

### 1.4 EC が必要とする widget アクションの全量

- **カスタム action** (`ElementWidgetActions`): `io.element.join` (widget→host)、`im.vector.hangup`
  (双方向)、`io.element.close` (widget→host)、`io.element.device_mute` (双方向)、`theme_change`
  (host→widget)。
- **汎用 action** (matrix-js-sdk `RoomWidgetClient` 経由): `send_event` (CallNotify /
  RTCNotification / encryption_keys / Reaction / Redaction 等)、`send_to_device`、state 送受信
  (`update_state`)、`get_openid`、`watch_turn_servers` / `unwatch_turn_servers`、
  `org.matrix.msc4157.update_delayed_event`、`org.matrix.msc4039.upload_file` / `download_file` /
  `get_media_config`、`set_always_on_screen`、`content_loaded`、`supported_api_versions`、
  `org.matrix.msc2974.request_capabilities` (capability 再交渉)。
- これらは全て transport 経由の JSON メッセージ → **(A) が通れば全部通る**。個別対応は不要。

### 1.5 (B) の実態: widget action が存在しない操作群

EC の**画面共有トグル・スポットライト/グリッド切替・強調選択・リアクション・設定パネル開閉には
対応する widget action が存在しない** (EC 内部の React state に閉じている)。だからこそ web 版の
`CallControl.ts` は iframe の `contentDocument` に対する `querySelector` / `.click()` /
`MutationObserver` で実現している。WebContentsView はプロセス分離されており host から DOM に
触れないため、**この経路はネイティブでは原理的に成立しない**。

## 2. 設計

### 2.1 (A) NativeWidgetTransport: iframe シム + 素通しルータ

検討した 3 案のうち **(a) を採用**:

- **(a) iframe シム** ✅ — `{ contentWindow: { postMessage }, addEventListener, removeEventListener }`
  だけの最小オブジェクトを `new ClientWidgetApi(widget, shim, driver)` に渡す。
  matrix-widget-api 無改造 = upstream 追従リスクゼロ。TS 上は
  `as unknown as HTMLIFrameElement` キャストが必要 (実行時に使われるのは上記 3 プロパティのみ)。
- (b) PostmessageTransport 自作 / ClientWidgetApi フォーク ❌ — transport はコンストラクタ内で
  直書き生成されており、差し替えには結局コンストラクタごと置き換えが必要 = (a) と同じ着地に
  フォークのコストだけ上乗せ。
- (c) ClientWidgetApi を使わず自前処理 ❌ — capability 交渉・再交渉・sticky event 等の状態機械の
  再実装になり、EC の要求 capability 変更のたびに追随が必要。

**中継経路** (1.1 の制約から送受で非対称):

```
[cinny window (メイン BrowserWindow)]                [main プロセス]        [call WebContentsView]
 ClientWidgetApi ── shim.contentWindow.postMessage
   → preload: ipcRenderer.send('native:widget-to-view') → 素通し転送 → callView preload:
                                                                        window.postMessage(msg, origin)
                                                                          → EC の window に着地
                                                                        (EC は window.parent===window
                                                                         の自己ループで送受する)
 window に 'message' イベント着地 ← preload:            ← 素通し転送 ← callView preload:
   → PostmessageTransport.inboundWindow                                  window の 'message' を捕捉し
     (= globalThis) が受理                                               ipcRenderer.send(
 ← shell preload: window.postMessage(msg, origin)                        'native:widget-from-view',
                                                                          {data, origin, sourceIsSelf})
```

- **main プロセスは通話 1 本につき 2 チャンネルを素通しするだけの薄いルータ**。
  M0 prototype の「main がスタブ応答を生成する」(`responseForWidgetRequest`) 設計は**廃止**し、
  応答は cinny 側の本物の `ClientWidgetApi` / `CallWidgetDriver` が生成する。
  ここが prototype と本実装の最大の差分。
- 検証 (origin / widgetId / `sourceIsSelf===true`) は M0 で確立した
  `validateWidgetBridgeMessage` を中継点で継続適用する。
- call view 側 preload (`widget-bridge-preload.cjs`) は M0 実装をほぼ流用可能。
  **新設が必要なのは cinny window 側の preload** (`native:widget-from-view` を受けて
  `window.postMessage` で折り返す 1 本)。

### 2.2 (B) NativeCallControl: DOM ロジックの移設 + RPC 化

- 現行 `CallControl.ts` の `querySelector` / `MutationObserver` / `.click()` ロジックを
  **call view の preload へ移植**する (preload は同一レンダラプロセス内なので EC の実 DOM に
  完全アクセスできる)。
- host 側に `NativeCallControl` を新設。**public インターフェースは `CallControl` と同一**
  (`toggleMicrophone/toggleVideo/toggleSound/toggleScreenshare/toggleSpotlight/toggleEmphasis/
  toggleReactions/toggleSettings/applyState/dispose` + `CallControlEvent.StateUpdate` emit)。
  各メソッドの中身を `ipcRenderer.invoke('native:call-control:<action>')` → main → call view
  preload の RPC に置き換え、状態変化は call view preload → IPC push → host が同じ
  `StateUpdate` を emit する対称構造にする。
  → `useCallControlState` / `CallControls.tsx` は public インターフェースのみに依存しているため
  **無改造で動く**。
- 別解「EC をフォークして screenshare 等の widget action を新設」は、EC v0.20.1 固定 +
  upstream 追従最小化の方針 (fork-strategy) と衝突するため**不採用**。DOM 移設なら EC 本体は
  無改造で cinny + シェル側だけで完結する。

### 2.3 ファイル分割

cinny 側 (fork、`src/app/plugins/call/native/`):

```
NativeIframeShim.ts     # 2.1 のシム (contentWindow.postMessage → IPC 委譲)
NativeCallEmbed.ts      # CallEmbed 相当。getIframe() の代わりにシム生成、container append 省略。
                        # CallControl 依存を切るため CallEmbed を継承せず並存
NativeCallControl.ts    # CallControl と同一インターフェース、実装は RPC (2.2)
nativeBridge.ts         # window.selfmatrixNative の型定義と薄いラッパー
```

シェル側 (現 native-prototype、M2 で selfmatrix-desktop へ卒業):

```
src/main.cjs                  # 素通しルータへ書き換え (スタブ応答生成を廃止)
src/shell-preload.cjs         # 新規: native:widget-from-view → window.postMessage (cinny window 側)
src/widget-bridge-preload.cjs # 既存流用 (call view 側)
```

- `CallWidgetDriver` は無改造。`createCallEmbed()` ファクトリの環境判定
  (`window.selfmatrixNative` の有無) で `CallEmbed` / `NativeCallEmbed` を切り替える程度の
  接続改造に抑える。
- **CallPopout はネイティブ版では丸ごと不要になる見込み**: M3 の窓移動は WebContentsView の
  `removeChildView` / `addChildView` (再親子付け) で行い、`window.open` + postMessage 再中継は
  使わない。

## 3. 検証手順 (prototype、M1 step 1〜3)

workspace の実行可能コード運用ルール (native-milestones 末尾) に従う:
検証入口のみ / 証跡コミット / テストは実装を呼ぶ / 変異ゲート。

1. **(A) 単体**: main.cjs のスタブ応答を外し、shell 側に実 `ClientWidgetApi` (npm の
   matrix-widget-api 実体) + 最小 `WidgetDriver` を iframe シムで起動。実 EC dist との
   `supported_api_versions` → `capabilities` → `content_loaded` ハンドシェイクが**本物の応答**で
   通ることを証跡化。※M0 の smoke evidence はスタブ応答であり、この検証はまだ済んでいない。
2. **(B) 単体**: call view preload に `CallControl` 相当の最小移植 (まず 1 ボタン、例:
   マイクトグル) を実装し、host からの RPC で EC 内 DOM が実際に変化 + `StateUpdate` 相当の
   push が返ることを証跡化。
3. **結合**: cinny 本体に `native/` 4 ファイルを実装し、prototype シェルから実 dev スタック
   (`pnpm backend`) へ join。M1 受け入れ (2 ユーザー通話 + 配信 + 無再接続の窓往復 E2E) へ接続。

## 4. リスク

| リスク | 深刻度 | 備考 |
| --- | --- | --- |
| (A) transport 差し替え | 低 | iframe 依存 2 行のみ、matrix-widget-api 無改造。**step 1 で実証済み** (2026-07-07、実 ClientWidgetApi + 実 EC dist で 14 versions / 53 capabilities のハンドシェイク完走) |
| (B) DOM コントロール移設 | **高** | Phase 2b の Discord 風コントロールバー全部が対象。EC の DOM 構造変化 (testid) への依存は web 版と同等のまま |
| inboundWindow=globalThis 制約 | 低 | shell preload の window.postMessage 折り返しで満たせる (step 1 で実証済み) |
| `waitForIframeLoad=false` 前提 | 低 | 'load' 未発火でも contentLoadedWaitTimer が未セットになるだけ |
| TURN servers 未実装 | 低 | web 版と同じ既定挙動。ネイティブ化で悪化しない |
| CallPopout 廃止判断 | 中 | M3 の再親子付け検証 (M1 の窓往復) が前提。NO-GO 時は web 版 call-window-mode に戻る |

### step 1 レビューで判明した残存リスク (M2 セキュリティ監査への引き継ぎ)

- **同一オリジン子フレームから main world API への到達**: prototype は cinny を同一オリジン iframe
  で埋め込むため、子フレーム内の JS が `window.parent` 経由で親の main world (送信 API) に届く。
  これは contextIsolation とは別レイヤーのブラウザ標準の同一オリジンアクセス。対策として送信 API を
  claim-once 化 (初回取得後は閉じる) + to-view 方向にも形状検証を実装。本番 (M2) では cinny が
  トップフレームになり前提が変わるため、**送信 API の公開境界は M2 監査で再設計**すること
- **shell ウィンドウ sandbox:false**: ClientWidgetApi をページ script で動かす構成により
  この設定の意味が重くなった。M2 で sandbox:true 化または構成見直しを検討
- **echo 現象 (既知・無害)**: call view preload は自分が postMessage した to-view メッセージも
  自分の 'message' リスナーで拾って from-view として再転送する。matrix-widget-api の
  PostmessageTransport が方向フィルタ (`request.api !== invertedDirection`) と requestId 照合
  (`outboundRequests`) で必ず握り潰すことをライブラリ実コードで確認済み (無限ループ・誤応答なし)。
  actionSequence にはこのノイズが混ざる。**test-harness の CLI はこの loopback を検証の観測点として
  利用しているため、echo を抑制してはならない**
- **to-view 系の証跡フィールドは「host が送った」ことの記録**であり EC の受信証明ではない。
  受信は capabilities 交渉の reply 到達で担保している (コード上にコメントで明記)
