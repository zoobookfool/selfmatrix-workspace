// M1 step 2 (B 単体実証): cinny `src/app/plugins/call/CallControl.ts` の DOM 操作ロジック
// (querySelector / .click() / MutationObserver) の最小移植。call view (EC WebContentsView) の
// isolated world で動く独立した preload スクリプト。preload は EC と同一レンダラプロセス内にいる
// ため、host (main / shell) からは触れない実 DOM に直接アクセスできる
// (design/native-widget-transport.md §2.2)。
//
// なぜ widget-bridge-preload.cjs から require せず、独立した preload として登録するのか
// (main.cjs の ensureCallView() が session.fromPartition(CALL_VIEW_PARTITION)
// .registerPreloadScript({ filePath: .../call-control-preload.cjs, type: "frame" }) で
// 2 本目の preload として登録する):
// call view は sandbox:true で動いている。実測したところ、sandbox 下の preload の require() は
// "electron" 以外のほぼ全て (node: 組み込みモジュール、相対パスの自前ファイル、__dirname も) を
// 解決できない (`Error: module not found: path` 等、`__dirname is not defined`)。そのため
// widget-bridge-preload.cjs から `require("./call-control-preload.cjs")` する分離方法は
// sandbox 下では成立しない。Electron の `session.registerPreloadScript()`
// (絶対パスを main プロセス側で解決して登録する API) を使えば、ファイルとしては完全に分離した
// ままで、call view の同じフレームに 2 本目の preload として読み込ませられる。
// このファイル自身は "electron" の require だけで完結させてあり (それ以外は一切 require しない)、
// これは sandbox 下でも解決できることを widget-bridge-preload.cjs で確認済み。
//
// document / MutationObserver などの DOM グローバルへの参照は必ず関数本体の中 (実際に EC の
// DOM 操作が起きるタイミング) に限定してある。
//
// 探査結果 (evidence/call-control-result.json 参照) と逸脱:
// - この prototype はバックエンド無しのため、EC は在室通話 UI ではなく
//   `ErrorView.tsx` (`Room not found. The widget-api did not pass over the relevant room
//   events/information.` — useLoadGroupCall.ts) を描画する。ロビー (マイク/カメラトグル) は
//   到達できない。CallControl.ts の `[data-testid="incall_screenshare"]` 等のセレクタは
//   いずれも実在しない (逸脱 1)。
// - CallControl.ts を読むと、そもそも toggleMicrophone/toggleVideo は DOM クリックではなく
//   widget action (`ElementWidgetActions.DeviceMute` 経由の `call.transport.send()`) で実装されて
//   おり、querySelector/.click() で実装されているのは screenshare/spotlight/grid/emphasis/
//   reactions/settings 側だけだった。つまり「マイクトグルがあればそれを対象にする」という前提は
//   実装上そもそも成立しない (マイクトグルは (A) 系統であって (B) 系統ではない)。
// - この環境で実在する唯一の操作可能コントロールは ErrorView.tsx の CloseWidgetButton
//   (`[role="button"][data-kind="primary"]`。data-testid は無し) のみ。これを対象に選ぶ (逸脱 2)。
// - CloseWidgetButton 自身の属性は EC 側では click しても変化しない (shell 側の
//   NativeWidgetDriver が `io.element.close` を処理しないため、EC が
//   `widget.api.transport.send(ElementWidgetActions.Close, {})` を送っても host から応答が
//   無く、ボタン自身の DOM 属性は不変のまま)。real な screenshare/emphasis 相当 (click → 属性変化 →
//   MutationObserver) の型を単体実証するため、実クリックイベント (`.click()` が実際に発火させる
//   ネイティブ 'click' イベント) を起点に `data-selfmatrix-pressed` 属性を preload 側で
//   トグルする (逸脱 3)。real な in-call コントロールに差し替わる際は、この属性トグル部分だけを
//   EC 自身の状態変化の監視 (例: emphasisButton の `checked` プロパティ) に置き換えればよい。

const { ipcRenderer } = require("electron");

const TARGET_SELECTOR = '[role="button"][data-kind="primary"]';

const state = {
  invokeCount: 0,
};
let mutationObserver = null;

function findTarget() {
  return document.querySelector(TARGET_SELECTOR);
}

function pushState(target, reason) {
  ipcRenderer.send("native:call-control:state", {
    t: Date.now(),
    reason,
    selector: TARGET_SELECTOR,
    pressed: target.getAttribute("data-selfmatrix-pressed") === "true",
  });
}

// CallControl.ts の controlMutationObserver 相当: 対象要素の属性変化を監視し、変化を
// IPC push で host (main 経由 shell) へ伝える。
function observe(target) {
  if (mutationObserver) mutationObserver.disconnect();
  mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "data-selfmatrix-pressed") {
        pushState(target, "mutation-observed");
      }
    }
  });
  mutationObserver.observe(target, {
    attributes: true,
    attributeFilter: ["data-selfmatrix-pressed"],
  });
}

// 実クリックイベントを起点に data-selfmatrix-pressed をトグルする (上記コメントの逸脱 3)。
// click() を呼ばずに直接属性を書き換えるコードパスを作らない: これにより「クリック処理を
// no-op 化する」変異は、このリスナー自体が発火しなくなり属性が変化しなくなる形で検知できる。
function ensureClickListener(target) {
  if (target.__selfmatrixCallControlBound) return;
  target.__selfmatrixCallControlBound = true;
  if (!target.hasAttribute("data-selfmatrix-pressed")) {
    target.setAttribute("data-selfmatrix-pressed", "false");
  }
  target.addEventListener("click", () => {
    const next = target.getAttribute("data-selfmatrix-pressed") !== "true";
    target.setAttribute("data-selfmatrix-pressed", String(next));
  });
}

function invoke(action) {
  const target = findTarget();
  if (!target) {
    return { ok: false, reason: "target_not_found", selector: TARGET_SELECTOR, action };
  }

  ensureClickListener(target);
  observe(target);

  if (action !== "toggleTarget") {
    return { ok: false, reason: "unknown_action", selector: TARGET_SELECTOR, action };
  }

  const before = target.getAttribute("data-selfmatrix-pressed");
  target.click();
  state.invokeCount += 1;
  const after = target.getAttribute("data-selfmatrix-pressed");

  return {
    ok: true,
    action,
    selector: TARGET_SELECTOR,
    before,
    after,
    invokeCount: state.invokeCount,
  };
}

// RPC: main.cjs の ipcMain.handle("native:call-control:invoke") が correlationId 付きで
// webContents.send してくるリクエストに応答する。main は action の意味を解釈しない中継役に
// 徹し (design/native-widget-transport.md §2.2)、実際の DOM 操作はすべてここで完結する。
ipcRenderer.on("native:call-control:invoke", (_event, request) => {
  const { correlationId, action } = request || {};
  let result;
  try {
    result = invoke(action);
  } catch (error) {
    result = {
      ok: false,
      reason: "exception",
      message: String(error && error.message ? error.message : error),
    };
  }
  ipcRenderer.send("native:call-control:invoke-result", { correlationId, result });
});
