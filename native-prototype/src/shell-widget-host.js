// shell 側 (cinny の BrowserWindow 相当) で本物の matrix-widget-api ClientWidgetApi を起動する。
//
// なぜこのファイルは preload ではなく desktop-shell.html の通常の <script> として読み込まれるのか:
// matrix-widget-api の PostmessageTransport は受信を `globalThis.addEventListener("message", ...)`
// に固定している (design/native-widget-transport.md §1.1)。この `globalThis` は
// ClientWidgetApi を構築したコンテキストの global を指す。preload スクリプト (contextIsolation
// 有効時) は実フレームの window に対して postMessage の送受信こそできるものの、preload 自身の
// globalThis が「ページの通常スクリプトが見る globalThis」と同一である保証は Electron の
// ドキュメント上ない (isolated world は DOM を共有するが JS ヒープは分離される)。
// 一方 cinny 本番では ClientWidgetApi は cinny 自身の vite バンドル内、つまりページの通常の
// (nodeIntegration 相当ではない、素の) スクリプトコンテキストで動く。そこでは globalThis は
// 疑いなくそのページの window そのものである。
// 本プロトタイプでもそれに最も近い構成として、ClientWidgetApi をこのページの通常スクリプト
// コンテキストで動かすことにした。ただし本番は vite/rollup がバンドルした ESM import なのに対し、
// ここでは matrix-widget-api が配布する browserify 済み UMD バンドル
// (node_modules/matrix-widget-api/dist/api.js, window.mxwidgets を公開) を <script> タグで
// 素朴に読み込んでいる点が本番との構成差分 (モジュールの中身・挙動は同一、ロード方式のみ異なる)。
//
// nodeIntegration:false のページなので ipcRenderer には直接触れない。shell-preload.cjs が
// contextBridge 経由で公開する window.selfmatrixNative.claimWidgetTransport() を起動時に一度だけ
// 呼び、そこから受け取る sendToView() / notifyWidgetHostReady() を薄く呼ぶだけで、main プロセスへの
// 実際の IPC 送信は preload 側の責務のままにする (F2b, 受け入れレビュー修正: claim-once の理由は
// 下の IIFE 冒頭のコメント参照)。
(function () {
  "use strict";

  // F2b (受け入れレビュー修正): このページスクリプトは cinny iframe (#cinny-frame) の子コンテンツ
  // より先に実行される — 同じ HTML パース中に <script> はブロッキング実行されるのに対し、iframe の
  // 中身はネットワークフェッチを挟んでから読み込まれるため、ここでの claim は必ず先取りできる。
  // claimWidgetTransport() は初回だけ送信 API を払い出し、2 回目以降は throw する
  // (shell-preload.cjs 参照)。cinny iframe 側からの window.parent.selfmatrixNative 経由の
  // 到達を、ここで先に claim してしまうことで塞ぐ。
  const widgetTransport = window.selfmatrixNative.claimWidgetTransport();

  function createIframeShim(postToView) {
    const listeners = new Map();
    return {
      // ClientWidgetApi のコンストラクタが読むのは contentWindow.postMessage だけ
      // (design/native-widget-transport.md §1.1, §2.1)。iframe は実在しないのでこの最小オブジェクトで足りる。
      contentWindow: {
        postMessage(message) {
          postToView(message);
        },
      },
      // ClientWidgetApi は 'load' を addEventListener するが、widget は waitForIframeLoad:false
      // で生成するため 'load' が発火しないことに実害はない (design §1.1)。呼ばれても記録するだけ。
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
    };
  }

  function createNativeWidgetDriver(WidgetDriver) {
    return class NativeWidgetDriver extends WidgetDriver {
      // M1 step 1 は widget-api トランスポート単体の実証が目的なので、要求された capability は
      // 検証なしで全承認する (design 手順1「driver 承認」)。個別の可否判定・ユーザー確認 UI・
      // sendEvent/sendToDevice 等の実装は (B) 以降 / 結合フェーズのスコープ。
      validateCapabilities(requested) {
        return Promise.resolve(new Set(requested));
      }
    };
  }

  async function boot() {
    const mxwidgets = window.mxwidgets;
    if (!mxwidgets) throw new Error("matrix-widget-api UMD bundle (window.mxwidgets) not loaded");

    const config = await fetch("/widget-config.json").then((response) => response.json());

    const widget = new mxwidgets.Widget({
      id: config.widgetId,
      creatorUserId: config.userId,
      type: "m.call",
      // Widget.origin (= transport.targetOrigin, 本シムでは未使用) の算出にのみ使われるテンプレート URL。
      url: `${window.location.origin}/ec/index.html`,
      waitForIframeLoad: false,
    });

    const NativeWidgetDriver = createNativeWidgetDriver(mxwidgets.WidgetDriver);
    const driver = new NativeWidgetDriver();
    const shim = createIframeShim((message) => widgetTransport.sendToView(message));
    const clientWidgetApi = new mxwidgets.ClientWidgetApi(widget, shim, driver);

    const listeners = new Set();
    function notify(direction, detail) {
      for (const listener of listeners) {
        try {
          listener(direction, detail);
        } catch (error) {
          console.error("[shell-widget-host] listener failed", error);
        }
      }
    }

    clientWidgetApi.on("ready", () => notify("lifecycle", { event: "ready" }));
    clientWidgetApi.on("capabilitiesNotified", () =>
      notify("lifecycle", { event: "capabilitiesNotified", allowed: Array.from(clientWidgetApi.allowedCapabilities) }),
    );
    // UI ログ用の補助的な観測経路。ClientWidgetApi 自身の transport もこの同じ window の
    // 'message' を購読しているので、ここでの傍受はハンドシェイクの挙動には影響しない。
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      notify("inbound", event.data);
    });

    window.selfmatrixWidgetHost = {
      config,
      widget,
      driver,
      clientWidgetApi,
      // io.element.join 等のホスト起点カスタム action。本番の CallEmbed も
      // call.transport.send() 経由でこれと同じものを呼ぶ (design §1.3)。
      // F3 (受け入れレビュー修正): 「通話 View 起動」ボタンを押す前に Join/DeviceMute/Hangup を
      // 押すと転送先の call view が無く 10 秒無音タイムアウトになる退行があった
      // (M0 の sendWidgetAction は ensureCallView を内包していたが、M1 step 1 の素通しルータ化で
      // 抜け落ちていた)。送信前に必ず ensureCallView() を await する — 既に起動済みなら
      // main.cjs 側の ensureCallView() が即 return するだけで無害。
      async sendAction(action, data) {
        await window.selfmatrixNative.ensureCallView();
        return clientWidgetApi.transport.send(action, data || {});
      },
      onMessage(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    };

    widgetTransport.notifyWidgetHostReady();
  }

  boot().catch((error) => {
    console.error("[shell-widget-host] boot failed", error);
  });
})();
