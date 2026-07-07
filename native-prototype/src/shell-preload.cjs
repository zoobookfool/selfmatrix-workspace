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
    // M1 step 2 (B 単体実証): NativeCallControl 相当の RPC 入口。ipcMain.handle 側 (main.cjs) が
    // correlationId を発行して call view preload (call-control-preload.cjs) と往復するので、
    // ここは ipcRenderer.invoke を薄く呼ぶだけで済む (往復の相関はすべて main.cjs 側の責務)。
    // F7 (受け入れレビュー修正): 当初はこの RPC を claim-once の外、selfmatrixNative に常時公開して
    // いた ("この RPC はユーザーが通話 UI 上のボタンを直接クリックするのと機能的に同値だから安全"
    // という理由づけだったが、これは F2b の claimWidgetTransport() が塞いだはずの「同一オリジン
    // iframe (cinny 埋め込み) から window.parent.selfmatrixNative 経由で送信 API に触れられる」経路を
    // この新チャンネルで再発させていた。実コントロール (画面共有トグル等) に対象が差し替わる step 3
    // では「ユーザー操作なしに他フレームから操作を起こせる面」になり得るため、送信 API
    // (sendToView/notifyWidgetHostReady) と同じ claim-once の対象に統合し、常時公開から外す。
    // host 側 (shell-widget-host.js) はここから受け取ったこの関数を使い、window.selfmatrixWidgetHost に
    // 安全なラッパー (callControlToggle()) を公開する。到達境界の再設計は design の「残存リスク」節と
    // 合わせて M2 セキュリティ監査で見直すこと。
    callControlInvoke: (action) => ipcRenderer.invoke("native:call-control:invoke", action),
  };
}

contextBridge.exposeInMainWorld("selfmatrixNative", {
  getStatus: () => ipcRenderer.invoke("native:get-status"),
  ensureCallView: () => ipcRenderer.invoke("native:ensure-call-view"),
  detachCallView: () => ipcRenderer.invoke("native:detach-call-view"),
  attachCallView: () => ipcRenderer.invoke("native:attach-call-view"),
  claimWidgetTransport,
});
