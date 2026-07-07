const { contextBridge, ipcRenderer } = require("electron");

// main が call view から受け取り検証済みの (validateWidgetBridgeMessage 通過済みの) 生の
// Widget API メッセージをここへ中継してくる。matrix-widget-api の PostmessageTransport は
// inboundWindow (= このページの globalThis) への本物の 'message' イベントでしか受信できない
// (design/native-widget-transport.md §1.1, §2.1) ため、window.postMessage で折り返して
// 本物の DOM イベントとして着地させる。preload の window は contextIsolation 下でも実際の
// フレームの window であり (widget-bridge-preload.cjs で同型の折り返しが M0 から動作実績あり)、
// shell-widget-host.js が構築する ClientWidgetApi のトランスポートはこのページの通常スクリプト
// コンテキストで動いているため、ここで postMessage したイベントは globalThis.addEventListener
// ("message", ...) で直接受け取れる。
ipcRenderer.on("native:widget-from-view", (_event, message) => {
  window.postMessage(message, window.location.origin);
});

// F2b (受け入れレビュー修正): この prototype は cinny を同一オリジンの iframe として埋め込んでいる
// (desktop-shell.html の #cinny-frame)。同一オリジンなので、cinny の iframe コンテンツ内の JS は
// ブラウザ標準の同一オリジンアクセスとして `window.parent.selfmatrixNative` に触れられる —
// これは contextIsolation とは別レイヤーの経路で、design/native-widget-transport.md の
// 「残存リスク」節に記録済み。sendToView/notifyWidgetHostReady を直接 exposeInMainWorld すると
// iframe 側から自由に widget メッセージを送信 API に流し込めてしまうため、「初回呼び出しでだけ
// 送信 API を払い出し、以後は throw する」claim-once 方式に変える。ページスクリプト
// (shell-widget-host.js) は iframe の子コンテンツより先に実行される (HTML パース順序で
// <script> がブロッキング実行されるのに対し、iframe の中身の読み込み・実行にはネットワーク
// フェッチが挟まるため確実に後になる) ため、起動時に先取り (claim) しきってしまえる。
let widgetTransportClaimed = false;
function claimWidgetTransport() {
  if (widgetTransportClaimed) {
    throw new Error(
      "selfmatrixNative widget transport already claimed. claimWidgetTransport() may only be called once " +
        "per shell window (F2b claim-once guard).",
    );
  }
  widgetTransportClaimed = true;
  return {
    // shell 側の本物の ClientWidgetApi (iframe シムの contentWindow.postMessage) から呼ばれる
    // 素通し送信。main はここに検証を挟まず call view へそのまま転送する: 送信元はこのプロセス
    // 自身の信頼できる ClientWidgetApi 実装であり、call view (未信頼な EC/widget コンテキスト) からの
    // spoofing 経路とは非対称なため (validateWidgetBridgeMessage が対象とするのは call view→shell の
    // 方向のみ)。F2a で main.cjs 側にも widgetId/api 方向の形状検証を追加し、こちらは防御を多重化した。
    sendToView: (message) => ipcRenderer.send("native:widget-to-view", message),
    // main の ensureCallView() は、shell 側の ClientWidgetApi が 'message' リスナーを登録し
    // 終えるまで EC の読み込みを遅延させる (でないと起動直後に EC が送る supported_api_versions /
    // content_loaded を取りこぼす競合が起き得る)。shell-widget-host.js の boot() 完了時に呼ばれる。
    notifyWidgetHostReady: () => ipcRenderer.send("native:widget-host-ready"),
  };
}

contextBridge.exposeInMainWorld("selfmatrixNative", {
  getStatus: () => ipcRenderer.invoke("native:get-status"),
  ensureCallView: () => ipcRenderer.invoke("native:ensure-call-view"),
  detachCallView: () => ipcRenderer.invoke("native:detach-call-view"),
  attachCallView: () => ipcRenderer.invoke("native:attach-call-view"),
  claimWidgetTransport,
});
