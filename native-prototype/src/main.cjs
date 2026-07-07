let electron = {};
try {
  electron = require("electron");
} catch (error) {
  if (require.main === module) throw error;
}
const { app, BrowserWindow, WebContentsView, desktopCapturer, ipcMain, session } = electron;
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

// Electron 非依存の Widget API bridge 純関数群は widget-bridge-protocol.cjs に集約されている。
// main.cjs はこれらを自前で再実装せず、常にこのモジュールへ委譲する
// (test-harness/cli/widget-protocol.mjs も同じモジュールを直接 require するため、
// 二重実装によるロジックのズレが起きない)。
//
// M1 step 1 以降、main.cjs は「通話 1 本につき 2 チャンネル (native:widget-to-view /
// native:widget-from-view) を素通しするだけの薄いルータ」になった (design/native-widget-transport.md
// §2.1)。responseForWidgetRequest による応答生成はライブ経路から除去済み — 実際の応答は shell
// 側の本物の ClientWidgetApi (src/shell-widget-host.js) が生成する。
const {
  WIDGET_ID,
  WIDGET_ROOM_ID,
  WIDGET_USER_ID,
  WIDGET_DEVICE_ID,
  WIDGET_BASE_URL,
  assertSameOrigin,
  buildWidgetUrl,
  validateWidgetBridgeMessage,
  validateToViewMessage,
} = require("./widget-bridge-protocol.cjs");

// F1 (受け入れレビュー修正): smoke がハンドシェイク完了後に注入する偽メッセージの action 名。
// widgetId をわざと WIDGET_ID と不一致にしてあるので validateWidgetBridgeMessage の
// widget_id_mismatch で必ず拒否される想定 — 拒否されなければ (＝すり抜ければ) smoke は fail する。
const SPOOF_ACTION = "selfmatrix.test.spoof";
const SPOOF_WIDGET_ID = "spoofed-widget-id";

// M1 step 2 (B 単体実証): native:call-control:invoke の correlationId 方式往復管理。
// main は action の意味を解釈しない中継役に徹する (design/native-widget-transport.md §2.2) —
// ここで持つのは「どの応答をどの ipcMain.handle() 呼び出しに戻すか」の相関だけで、
// action や result の中身は一切見ない。
const pendingCallControlInvokes = new Map();
let callControlInvokeSeq = 0;

// call view (EC WebContentsView) の永続パーティション名。ensureCallView() の
// WebContentsView 生成と、call-control-preload.cjs を 2 本目の preload として登録する
// session.fromPartition() の両方から同じ文字列を参照する必要があるため定数化した。
const CALL_VIEW_PARTITION = "persist:selfmatrix-native-prototype-call";

const appRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(appRoot, "evidence");
const isSmoke = process.argv.includes("--smoke");
const isMemoryProbe = process.argv.includes("--memory-probe");

const state = {
  origin: null,
  server: null,
  mainWindow: null,
  callWindow: null,
  callView: null,
  callViewState: "none",
  widgetMessages: [],
  // M1 step 2 (B 単体実証): native:call-control:* (invoke 要求/応答/MutationObserver state push) の
  // 全メッセージをここに記録する。widgetMessages と同じ「main は中継するだけ、判定は別関数に外出し」
  // という方針を踏襲する。
  callControlMessages: [],
  // 診断用 (call view 側 preload の読み込み時例外を記録。ensureCallView() 参照)。
  preloadErrors: [],
  navigationEvents: [],
  widgetHostReady: null,
  resolveWidgetHostReady: null,
};

// shell 側 (mainWindow の通常ページスクリプト, src/shell-widget-host.js) が本物の
// ClientWidgetApi を構築し 'message' リスナーの登録まで終えたことを main プロセスへ知らせる合図。
// ensureCallView() はこの合図を待ってから EC の読み込みを開始する。待たないと、EC が起動直後に
// 送る supported_api_versions / content_loaded を shell 側がまだリッスンしておらず取りこぼす
// 競合が起き得る (design/native-widget-transport.md §1.1 の inboundWindow=globalThis 制約)。
state.widgetHostReady = new Promise((resolve) => {
  state.resolveWidgetHostReady = resolve;
});

if (app) {
  app.on("window-all-closed", () => {
    if (!isSmoke && !isMemoryProbe) app.quit();
  });
}

function resolveArtifact(envName, relativeParts) {
  if (process.env[envName]) return path.resolve(process.env[envName]);
  return path.join(os.homedir(), "Documents", "DiscordSub", ...relativeParts);
}

const cinnyDist = resolveArtifact("SELFMATRIX_CINNY_DIST", ["cinny", "dist"]);
const ecDist = resolveArtifact("SELFMATRIX_EC_DIST", ["element-call", "dist"]);

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

function resolveStatic(root, subpath, fallbackIndex = false) {
  const clean = subpath.replace(/^\/+/, "");
  let filePath = path.resolve(root, clean || "index.html");
  const rootResolved = path.resolve(root);
  if (!isInsidePath(rootResolved, filePath)) return null;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath) && fallbackIndex) {
    filePath = path.join(rootResolved, "index.html");
  }
  if (!isInsidePath(rootResolved, filePath) || !fs.existsSync(filePath)) return null;
  return filePath;
}

function isInsidePath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function serveFile(response, filePath) {
  response.writeHead(200, { "Content-Type": contentType(filePath) });
  fs.createReadStream(filePath).pipe(response);
}

function startServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");

    if (url.pathname === "/" || url.pathname === "/desktop-shell.html") {
      serveFile(response, path.join(__dirname, "desktop-shell.html"));
      return;
    }
    if (url.pathname === "/desktop-shell.js") {
      serveFile(response, path.join(__dirname, "desktop-shell.js"));
      return;
    }
    if (url.pathname === "/shell-widget-host.js") {
      serveFile(response, path.join(__dirname, "shell-widget-host.js"));
      return;
    }
    if (url.pathname === "/vendor/matrix-widget-api.js") {
      // native-prototype に pinned dependency として追加した matrix-widget-api の browserify 済み
      // UMD バンドル (window.mxwidgets を公開)。shell-widget-host.js の冒頭コメント参照:
      // ClientWidgetApi をページの通常スクリプトコンテキストで動かすため <script> で読み込む。
      serveFile(response, path.join(appRoot, "node_modules", "matrix-widget-api", "dist", "api.js"));
      return;
    }
    if (url.pathname === "/widget-config.json") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          widgetId: WIDGET_ID,
          roomId: WIDGET_ROOM_ID,
          userId: WIDGET_USER_ID,
          deviceId: WIDGET_DEVICE_ID,
          baseUrl: WIDGET_BASE_URL,
        }),
      );
      return;
    }
    if (url.pathname === "/health.json") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, cinnyDist, ecDist }));
      return;
    }

    if (url.pathname.startsWith("/cinny/")) {
      const filePath = resolveStatic(cinnyDist, url.pathname.slice("/cinny/".length), true);
      if (filePath) return serveFile(response, filePath);
    }
    if (url.pathname.startsWith("/ec/")) {
      const filePath = resolveStatic(ecDist, url.pathname.slice("/ec/".length), true);
      if (filePath) return serveFile(response, filePath);
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      state.origin = `http://127.0.0.1:${address.port}`;
      state.server = server;
      resolve(server);
    });
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    title: "SelfMatrix Native Prototype",
    width: 1400,
    height: 860,
    show: !isSmoke,
    webPreferences: {
      preload: path.join(__dirname, "shell-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });
  win.loadURL(`${state.origin}/desktop-shell.html`);
  state.mainWindow = win;
  win.on("resize", updateCallViewBounds);
  return win;
}

function createCallWindow() {
  const win = new BrowserWindow({
    title: "SelfMatrix Call",
    width: 960,
    height: 640,
    show: !isSmoke,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.on("resize", updateCallViewBounds);
  win.on("closed", () => {
    state.callWindow = null;
    if (state.callView) attachCallView();
  });
  state.callWindow = win;
  return win;
}

function ecUrl() {
  // URL 組み立てと assertSameOrigin 呼び出しは buildWidgetUrl() 内にある。ここはその薄い委譲。
  return buildWidgetUrl({
    callOrigin: state.origin,
    parentOrigin: state.origin,
    widgetId: WIDGET_ID,
    roomId: WIDGET_ROOM_ID,
    userId: WIDGET_USER_ID,
    deviceId: WIDGET_DEVICE_ID,
    baseUrl: WIDGET_BASE_URL,
    intent: "join_existing_voice",
    preload: "true",
    skipLobby: "true",
    disableVideo: "true",
    hideVideoButton: "true",
    theme: "dark",
  });
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function ensureCallView() {
  if (state.callView) return;

  // shell 側の本物の ClientWidgetApi が 'message' リスナーの登録を終えるまで EC の読み込みを
  // 待つ (state 初期化コメント参照)。ここで待たずに loadURL してしまうと、shell-widget-host.js の
  // 起動が終わる前に EC が送る初回の supported_api_versions/content_loaded を取りこぼし得る。
  await withTimeout(
    state.widgetHostReady,
    10000,
    "Timed out waiting for shell-widget-host.js to report native:widget-host-ready. " +
      "The shell's ClientWidgetApi never finished booting (see desktop-shell.html script load order).",
  );

  // M1 step 2 (B 単体実証): CallControl 相当の DOM 操作ロジック (call-control-preload.cjs) を
  // 2 本目の preload として同じ call view partition/session に登録する。webPreferences.preload
  // (widget-bridge-preload.cjs) からの require では分離できなかった理由は
  // call-control-preload.cjs 冒頭のコメント参照 (sandbox 下の preload の require() は
  // "electron" 以外を解決できないことを実測で確認した)。session.registerPreloadScript() は
  // ファイルとしての分離を保ったまま、同じフレームに追加の preload を読み込ませられる。
  // ensureCallView() はこの関数の先頭の早期 return により call view 1 個の寿命中に一度しか
  // 呼ばれないため、登録も一度きりで良い。
  session.fromPartition(CALL_VIEW_PARTITION).registerPreloadScript({
    filePath: path.join(__dirname, "call-control-preload.cjs"),
    type: "frame",
  });

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "widget-bridge-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: CALL_VIEW_PARTITION,
    },
  });
  state.callView = view;
  state.callViewState = "attached";
  view.webContents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    state.navigationEvents.push({ t: Date.now(), url, isInPlace, isMainFrame });
  });
  view.webContents.on("render-process-gone", (_event, details) => {
    state.widgetMessages.push({ t: Date.now(), type: "render-process-gone", details });
  });
  // 診断用: call view 側のいずれかの preload (widget-bridge-preload.cjs /
  // call-control-preload.cjs) が読み込み時に例外を投げた場合、smoke は「対象が見つからず
  // タイムアウトし続ける」形でしか失敗が見えず原因追跡が難しい。preload-error を記録しておく。
  view.webContents.on("preload-error", (_event, preloadPath, error) => {
    state.preloadErrors.push({ t: Date.now(), preloadPath, error: String(error && error.stack ? error.stack : error) });
  });

  state.mainWindow.contentView.addChildView(view);
  updateCallViewBounds();
  await view.webContents.loadURL(ecUrl());
}

function updateCallViewBounds() {
  if (!state.callView) return;
  const owner = state.callViewState === "detached" ? state.callWindow : state.mainWindow;
  if (!owner || owner.isDestroyed()) return;
  const [width, height] = owner.getContentSize();
  if (state.callViewState === "detached") {
    state.callView.setBounds({ x: 0, y: 0, width, height });
  } else {
    const x = Math.max(380, Math.floor(width * 0.52));
    state.callView.setBounds({ x, y: 118, width: Math.max(360, width - x - 18), height: Math.max(260, height - 136) });
  }
}

async function detachCallView() {
  await ensureCallView();
  if (!state.callWindow) createCallWindow();
  if (state.callViewState !== "detached") {
    state.mainWindow.contentView.removeChildView(state.callView);
    state.callWindow.contentView.addChildView(state.callView);
    state.callViewState = "detached";
    updateCallViewBounds();
  }
}

async function attachCallView() {
  await ensureCallView();
  if (state.callViewState !== "attached") {
    state.callWindow?.contentView.removeChildView(state.callView);
    state.mainWindow.contentView.addChildView(state.callView);
    state.callViewState = "attached";
    updateCallViewBounds();
  }
}

// runSmoke() が main プロセス内から shell 側の本物の ClientWidgetApi へ toWidget カスタム
// action (io.element.join 等) を送らせるための薄いヘルパー。main 自身はもう Widget API リクエスト
// を組み立てない — page-context の window.selfmatrixWidgetHost.sendAction() (実体は
// clientWidgetApi.transport.send()) を executeJavaScript 経由で叩くだけ。EC には実 LiveKit
// バックエンドが無いため応答が返らない可能性があり、そのため await はせず (.catch で握り潰す)
// 「送信できたか」だけを見る。既存 M0 smoke の sawJoinRequest と同じ役割。
function sendWidgetActionFromShell(action, data) {
  const payload = JSON.stringify(data || {});
  return state.mainWindow.webContents.executeJavaScript(
    `window.selfmatrixWidgetHost.sendAction(${JSON.stringify(action)}, ${payload}).catch(() => {})`,
    true,
  );
}

// M1 step 2 (B 単体実証): runSmoke() が shell 側の window.selfmatrixWidgetHost.callControlToggle()
// を executeJavaScript 経由で叩く薄いヘルパー。sendWidgetActionFromShell() と同じパターン:
// main 自身は RPC の中身を組み立てない。
// F7 (受け入れレビュー修正): 以前は window.selfmatrixNative.callControlInvoke(action) を常時公開の
// selfmatrixNative から直接叩いていたが、これは claimWidgetTransport() が塞いだはずの「同一オリジン
// iframe (cinny 埋め込み) から window.parent 経由で送信 API に触れられる」経路をこの新チャンネルで
// 再発させていた。callControlInvoke は claimWidgetTransport() が返すオブジェクトへ移設し、host は
// shell-widget-host.js が公開する window.selfmatrixWidgetHost.callControlToggle() 経由でのみ叩く
// (詳細は shell-preload.cjs / shell-widget-host.js のコメント参照)。
function invokeCallControlFromShell() {
  return state.mainWindow.webContents.executeJavaScript(
    `window.selfmatrixWidgetHost.callControlToggle()`,
    true,
  );
}

// EC 側の React マウント (ErrorView 到達までの非同期チェーン) 完了を待つため、対象コントロールが
// 見つかるまで invoke を再試行する。call-control-preload.cjs の invoke() は対象が無ければ
// 副作用なしで { ok:false, reason:"target_not_found" } を返すだけなので、再試行は安全に冪等。
async function waitForCallControlInvoke(timeoutMs = 10000) {
  const started = Date.now();
  let lastResult = null;
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      lastResult = await invokeCallControlFromShell();
      lastError = null;
      if (lastResult && lastResult.ok) return { result: lastResult, error: null };
    } catch (error) {
      lastError = error;
    }
    await wait(300);
  }
  return { result: lastResult, error: lastError };
}

// M1 step 2 の受け入れ判定。4 つの pass フィールドはそれぞれ独立した変異観点に対応する
// (完了報告の変異テスト観点参照):
//   - rpcRoundTrip: shell→main→callView→main→shell の往復が correlationId 相関込みで完走したこと。
//     main.cjs の relay (ipcMain.handle/ipcMain.on の correlationId 相関) を壊すと確実に false になる。
//   - domChanged: 実際に対象要素の data-selfmatrix-pressed 属性が click 前後で変化したこと。
//     call-control-preload.cjs の click() 呼び出しを no-op化すると before===after になり false になる。
//   - statePushSeen: MutationObserver 由来の state push (reason:"mutation-observed") が
//     main まで届いたこと。call-control-preload.cjs の observe() 登録を削除すると、click 自体は
//     成功して domChanged は true のままでも push が届かず false になる。
//   - realClickConfirmed (F6, 受け入れレビュー修正): domChanged/statePushSeen は preload 自身が
//     付ける合成属性 data-selfmatrix-pressed の自己完結観測に過ぎない。call-control-preload.cjs の
//     invoke() 内で target.click() を「属性を直接トグルするだけのコード」に置き換える回帰が入っても、
//     preload が自分で属性を書き換えて自分の MutationObserver で気付くだけなので domChanged/
//     statePushSeen は変化せず検知できない。これを塞ぐため、click() が本当に EC 本体 (ErrorView の
//     CloseWidgetButton) の React onClick を発火させたことの独立した傍証として、invoke 実行後に
//     EC が実際に送信した io.element.close (from-view、validateWidgetBridgeMessage を通過し受理
//     されたもの。widget-message-rejected は数えない) の出現を確認する。この傍証は
//     「クリック → CloseWidgetButton の onClick → widget.api.transport.send(Close)」という
//     EC 側の実装に依存している。
//     **この判定は M1 step 2 の対象 (ErrorView.tsx の CloseWidgetButton) に固有の傍証である**。
//     step 3 で対象を実コントロール (画面共有トグル等) に差し替える際は、io.element.close の代わりに
//     その対象が実際に送信する widget action / DOM 状態変化など、対象固有の独立シグナルに
//     置き換えること。
function analyzeCallControl(invokeResult, invokeError, invokeStartedAt) {
  const statePushes = state.callControlMessages.filter((message) => message.direction === "state-push");
  const mutationPushes = statePushes.filter((message) => message.reason === "mutation-observed");

  const rpcRoundTrip = invokeError === null && Boolean(invokeResult) && invokeResult.ok === true;
  const domChanged =
    rpcRoundTrip &&
    typeof invokeResult.before === "string" &&
    typeof invokeResult.after === "string" &&
    invokeResult.before !== invokeResult.after;
  const statePushSeen = mutationPushes.length > 0;
  const realClickConfirmed = acceptedWidgetMessages().some(
    (message) =>
      message.direction === "from-view" &&
      message.data?.action === "io.element.close" &&
      typeof invokeStartedAt === "number" &&
      message.t >= invokeStartedAt,
  );

  return {
    pass: rpcRoundTrip && domChanged && statePushSeen && realClickConfirmed,
    rpcRoundTrip,
    domChanged,
    statePushSeen,
    realClickConfirmed,
    invokeError: invokeError ? String(invokeError.message || invokeError) : null,
    targetSelector: invokeResult?.selector ?? null,
    targetFound: Boolean(invokeResult?.ok || (invokeResult && invokeResult.reason !== "target_not_found")),
    action: invokeResult?.action ?? null,
    before: invokeResult?.before ?? null,
    after: invokeResult?.after ?? null,
    statePushCount: statePushes.length,
    mutationPushCount: mutationPushes.length,
    statePushes,
  };
}

function setupIpc() {
  ipcMain.handle("native:get-status", () => ({
    origin: state.origin,
    callViewState: state.callViewState,
    widgetMessageCount: state.widgetMessages.length,
    cinnyDist,
    ecDist,
  }));
  ipcMain.handle("native:ensure-call-view", () => ensureCallView());
  ipcMain.handle("native:detach-call-view", () => detachCallView());
  ipcMain.handle("native:attach-call-view", () => attachCallView());

  ipcMain.on("native:widget-host-ready", () => {
    state.resolveWidgetHostReady();
  });

  // callView → shell 方向。call view の未信頼な (EC/widget) コンテキストから来るメッセージなので
  // M0 で確立した origin / widgetId / sourceIsSelf===true の検証を継続適用する。拒否された
  // メッセージは shell へ転送しない (widget-message-rejected として記録するのみ)。
  ipcMain.on("native:widget-from-view", (_event, message) => {
    const validation = validateWidgetBridgeMessage(message, {
      expectedOrigin: state.origin,
      expectedWidgetId: WIDGET_ID,
    });
    if (!validation.ok) {
      state.widgetMessages.push({
        t: Date.now(),
        type: "widget-message-rejected",
        direction: "from-view",
        validation,
        data: message?.data,
      });
      return;
    }

    state.widgetMessages.push({ t: Date.now(), direction: "from-view", ...message });
    // 素通し転送: 生の Widget API メッセージ (message.data) だけを shell へ渡す。shell-preload.cjs
    // がこれを window.postMessage で折り返し、ClientWidgetApi の transport が本物の 'message'
    // イベントとして受け取る。
    state.mainWindow?.webContents.send("native:widget-from-view", message.data);
  });

  // shell → callView 方向。送信元は shell 自身の ClientWidgetApi (信頼できるホスト実装) なので
  // M0 由来の origin/sourceIsSelf 検証は不要だが、F2a (受け入れレビュー修正) で widgetId/api 方向
  // だけの最低限の形状検証を追加した。同一オリジンで埋め込まれた cinny iframe の子コンテンツが
  // window.parent 経由で送信 API に触れられる面が (F2b の claim-once とは別に) 理論上あるため
  // (design/native-widget-transport.md「残存リスク」節)、main.cjs 側でも防御を多重化する。
  // 不合格でも main.cjs は「解釈しないルータ」のままであり、応答内容の生成はしない — 転送するか
  // 拒否するかだけを判定する。
  ipcMain.on("native:widget-to-view", (_event, message) => {
    const validation = validateToViewMessage(message);
    if (!validation.ok) {
      state.widgetMessages.push({
        t: Date.now(),
        type: "widget-message-rejected",
        direction: "to-view",
        validation,
        data: message,
      });
      return;
    }

    state.widgetMessages.push({ t: Date.now(), direction: "to-view", data: message });
    state.callView?.webContents.send("native:widget-to-view", message);
  });

  // M1 step 2 (B 単体実証): shell (host) → callView preload への RPC。ipcRenderer.invoke 側
  // (shell-preload.cjs の callControlInvoke) はこの handle が返す Promise をそのまま受け取る。
  // ここから先 (main → callView) は webContents.send/ipcRenderer.send の fire-and-forget しか
  // 無いため、correlationId を発行して pendingCallControlInvokes で相関を取り、call view preload
  // からの native:call-control:invoke-result で resolve する。call view が無い/応答が無ければ
  // reject/timeout する — main は action の中身を一切解釈しない (design §2.2)。
  ipcMain.handle("native:call-control:invoke", (_event, action) => {
    return new Promise((resolve, reject) => {
      if (!state.callView) {
        reject(new Error("native:call-control:invoke: call view is not attached"));
        return;
      }
      callControlInvokeSeq += 1;
      const correlationId = `call-control-${callControlInvokeSeq}-${Date.now()}`;
      const timer = setTimeout(() => {
        pendingCallControlInvokes.delete(correlationId);
        reject(new Error(`native:call-control:invoke timed out waiting for correlationId ${correlationId}`));
      }, 5000);
      pendingCallControlInvokes.set(correlationId, { resolve, reject, timer });
      state.callControlMessages.push({ t: Date.now(), direction: "to-view", correlationId, action });
      state.callView.webContents.send("native:call-control:invoke", { correlationId, action });
    });
  });

  // callView preload (call-control-preload.cjs) からの応答。correlationId が pending map に
  // 無ければ (未知/期限切れ) 記録するだけで何もしない — ここでも中身の解釈はしない。
  ipcMain.on("native:call-control:invoke-result", (_event, payload) => {
    const { correlationId, result } = payload || {};
    state.callControlMessages.push({ t: Date.now(), direction: "from-view", correlationId, result });
    const pending = pendingCallControlInvokes.get(correlationId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingCallControlInvokes.delete(correlationId);
    pending.resolve(result);
  });

  // call-control-preload.cjs の MutationObserver 由来の state push。素通し転送で shell (host)
  // 側の window にも中継する (design §2.2 の StateUpdate 相当。widget-to-view/from-view と同じ
  // 「main は中継するだけ」の形)。
  ipcMain.on("native:call-control:state", (_event, payload) => {
    state.callControlMessages.push({ t: Date.now(), direction: "state-push", ...payload });
    state.mainWindow?.webContents.send("native:call-control:state", payload);
  });
}

function setupDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } })
      .then((sources) => {
        const source = sources.find((item) => item.id.startsWith("screen:")) || sources[0];
        callback({
          video: source,
          audio: request.audioRequested && process.platform === "win32" ? "loopback" : false,
        });
      })
      .catch(() => callback({}));
  });
}

function sanitizeEvidenceString(value) {
  if (typeof value !== "string" || !state.origin) return value;
  return value
    .replaceAll(encodeURIComponent(state.origin), "http%3A%2F%2F127.0.0.1%3A%3Clocal-port%3E")
    .replaceAll(state.origin, "http://127.0.0.1:<local-port>");
}

function sanitizeEvidenceMessage(message) {
  return {
    ...message,
    origin: sanitizeEvidenceString(message.origin),
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// bridge の検証で拒否されたメッセージ (widget-message-rejected) は「action が観測された」判定から
// 除外する。拒否メッセージにも data.action は残っているため、これを除外しないと
// widgetId/origin/sourceIsSelf 検証が壊れて全メッセージが拒否されていても pass:true になり得る。
function acceptedWidgetMessages() {
  return state.widgetMessages.filter((message) => message.type !== "widget-message-rejected");
}

async function waitForWidgetAction(action, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (acceptedWidgetMessages().some((message) => message.data?.action === action)) return true;
    await wait(100);
  }
  return false;
}

// F1 (受け入れレビュー修正): 拒否記録 (widget-message-rejected) 側で action の出現を待つ。
// waitForWidgetAction は acceptedWidgetMessages() (拒否を除外したもの) しか見ないため、
// スプーフ注入がちゃんと拒否されたことを確認するにはこちらが要る。
async function waitForRejectedAction(action, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (
      state.widgetMessages.some(
        (message) => message.type === "widget-message-rejected" && message.data?.action === action,
      )
    ) {
      return true;
    }
    await wait(100);
  }
  return false;
}

// F1: ハンドシェイク完了後に call view (EC の window) へ偽の fromWidget メッセージを直接
// window.postMessage する。widget-bridge-preload.cjs は window.addEventListener("message", ...) で
// これを拾い (source===window なので sourceIsSelf:true になる)、native:widget-from-view で main へ
// 転送する。widgetId が WIDGET_ID と不一致なので validateWidgetBridgeMessage の widget_id_mismatch
// で必ず拒否されるはず — 拒否されず shell 側へ転送されてしまえば (=すり抜ければ) F1 が検知する。
function injectSpoofedFromViewMessage() {
  const spoofMessage = {
    api: "fromWidget",
    widgetId: SPOOF_WIDGET_ID,
    requestId: "spoof-test-1",
    action: SPOOF_ACTION,
    data: {},
  };
  return state.callView.webContents.executeJavaScript(
    `window.postMessage(${JSON.stringify(spoofMessage)}, window.location.origin)`,
    true,
  );
}

// F2b: shell-preload.cjs の claimWidgetTransport() が二重呼び出しで throw することを、shell の
// page-context (desktop-shell.html) から実際に呼んでみて確認する。shell-widget-host.js が起動時に
// 一度 claim 済みのはずなので、ここでの 2 回目の呼び出しは必ず throw するはず — throw しなければ
// (＝claim-once が機能していなければ) claimGuard:false として記録し smoke を fail させる。
function verifyClaimGuard() {
  return state.mainWindow.webContents.executeJavaScript(
    `(() => {
      try {
        window.selfmatrixNative.claimWidgetTransport();
        return false;
      } catch (error) {
        return true;
      }
    })()`,
    true,
  );
}

// M1 step 1 のハンドシェイク解析: state.widgetMessages (main のルータが実際に中継した全メッセージ)
// だけを根拠に、応答が本物の ClientWidgetApi 由来であること (スタブでないこと) と、capability
// 交渉が (要求→driver 承認→notify) まで実際に往復したことを判定する。
// 各フィールドが何を保証するかは reviews 側の変異テスト観点 (完了報告参照) に対応させてある:
//   - supportedVersionsReal: シムの postMessage やルータ転送を壊すと to-view 側にこの応答自体が
//     現れなくなる。応答はあってもスタブに戻すと supported_versions が空配列に戻る。
//   - capabilitiesNegotiated: どちらか片方向でもルータ転送が壊れると Capabilities 往復
//     (toWidget ask → fromWidget reply → toWidget notify) が完成せず notify_capabilities 自体が
//     現れない。driver.validateCapabilities が空集合を返すよう壊されると notify は現れるが
//     approved が空になる。
//   - actionSequence には echo エントリ (widget-bridge-preload.cjs のコメント参照) が混ざる。
//     to-view 系のフィールド (sawJoinRequest 等) は「host が送った」という記録に過ぎず、EC 側が
//     実際に受け取ったことの証明ではない — 受信の担保は capabilitiesNegotiated が
//     (toWidget ask → fromWidget reply → toWidget notify) の往復完走を見ている点に依っている。
//   - spoofRejected/spoofLeaked/unexpectedRejectedCount (F1, 受け入れレビュー修正): 変異テストで
//     「main.cjs の from-view 検証を if (false) でバイパスしても両 npm test が green のまま」という
//     すり抜けが実測されたため追加した。rejectedMessageCount は既存 (M0 由来) の集計だが、それ単体は
//     「0 件だと全部素通し」なのか「本当に不正メッセージが無かった」のかを区別できず pass 判定にも
//     使われていなかった。runSmoke() が実際に 1 件スプーフを注入することで、
//     「拒否ロジックが本当に効いている」ことを毎回実証する。
function analyzeHandshake() {
  const accepted = acceptedWidgetMessages();
  const toView = accepted.filter((message) => message.direction === "to-view");
  const fromView = accepted.filter((message) => message.direction === "from-view");
  const rejected = state.widgetMessages.filter((message) => message.type === "widget-message-rejected");

  const supportedVersionsReply = toView.find(
    (message) => message.data?.action === "supported_api_versions" && message.data?.response,
  );
  const capabilitiesAsk = toView.find((message) => message.data?.action === "capabilities" && !message.data?.response);
  const capabilitiesReply = fromView.find(
    (message) => message.data?.action === "capabilities" && message.data?.response,
  );
  const notifyCapabilities = toView.find((message) => message.data?.action === "notify_capabilities");
  const contentLoadedAck = toView.find((message) => message.data?.action === "content_loaded" && message.data?.response);

  const supportedVersionsCount = supportedVersionsReply?.data?.response?.supported_versions?.length ?? 0;
  const approvedCapabilities = notifyCapabilities?.data?.data?.approved ?? [];
  const requestedCapabilities = capabilitiesReply?.data?.response?.capabilities ?? [];

  const actionSequence = accepted
    .slice()
    .sort((a, b) => a.t - b.t)
    .map((message) => `${message.direction}:${message.data?.action}${message.data?.response ? ":response" : ""}`);

  // F1: 拒否記録のうち、意図的に注入したスプーフ (data.action === SPOOF_ACTION) を分離する。
  // それ以外の拒否は正規トラフィックの誤拒否リグレッションを意味するので unexpectedRejectedCount に
  // 集計する (0 であるべき)。
  const spoofRejectedEntries = rejected.filter((message) => message.data?.action === SPOOF_ACTION);
  const spoofRejected = spoofRejectedEntries.length > 0;
  // 受理側 (accepted) に spoof action が紛れ込んでいたら、拒否ロジックが素通ししている証拠。
  const spoofLeaked = accepted.some((message) => message.data?.action === SPOOF_ACTION);
  const unexpectedRejectedCount = rejected.length - spoofRejectedEntries.length;

  return {
    // stub (widget-bridge-protocol.cjs#responseForWidgetRequest) always answered
    // supported_api_versions with `{ supported_versions: [] }`. The real ClientWidgetApi answers
    // with matrix-widget-api's non-empty CurrentApiVersions list, so a non-empty array here is
    // only possible if the live route is exercising the real library, not the removed stub.
    // F4 (受け入れレビュー修正): スタブ自体は M1 step 1 でライブ経路から既に撤去済み — この判定は
    // 「スタブに戻っていないか」ではなく「実 host (shell-widget-host.js の本物の ClientWidgetApi) が
    // 現に非空の応答を返したか」を毎回確認するリグレッション検知として機能している。
    supportedVersionsIsReal: {
      pass: Boolean(supportedVersionsReply) && supportedVersionsCount > 0,
      supportedVersionsCount,
      note: "Stub always returned supported_versions: []; real ClientWidgetApi returns CurrentApiVersions (non-empty).",
    },
    capabilitiesNegotiated: {
      pass:
        Boolean(capabilitiesAsk) &&
        Boolean(capabilitiesReply) &&
        Boolean(notifyCapabilities) &&
        approvedCapabilities.length > 0,
      capabilitiesAskSeen: Boolean(capabilitiesAsk),
      capabilitiesReplySeen: Boolean(capabilitiesReply),
      requestedCapabilityCount: requestedCapabilities.length,
      notifyCapabilitiesSeen: Boolean(notifyCapabilities),
      approvedCapabilityCount: approvedCapabilities.length,
    },
    contentLoadedAcked: Boolean(contentLoadedAck),
    rejectedMessageCount: rejected.length,
    spoofRejected,
    spoofLeaked,
    unexpectedRejectedCount,
    actionSequence,
  };
}

async function runSmoke() {
  await ensureCallView();
  const sawContentLoaded = await waitForWidgetAction("content_loaded");
  // capability 交渉 (content_loaded の ack を契機に beginCapabilities() が自動発火する) が
  // 往復し終える猶予。EC 側の応答を待つだけなので固定 wait ではなく安全側に長めを確保。
  await wait(1000);
  await detachCallView();
  await wait(250);
  await attachCallView();
  await wait(250);
  await detachCallView();
  await wait(250);
  await attachCallView();
  await sendWidgetActionFromShell("io.element.join", { audioInput: null, videoInput: null });
  await wait(500);

  // F1: ハンドシェイクが一通り済んだ後 (analyzeHandshake() より前) にスプーフを注入し、
  // 拒否記録が現れるのを待つ。memory probe には注入しない (現行のまま)。
  await injectSpoofedFromViewMessage();
  const spoofRejectionObserved = await waitForRejectedAction(SPOOF_ACTION);

  // F2b: claim-once ガードが機能していること (2 回目の claimWidgetTransport() が throw すること) を
  // 実際に呼んで確認する。
  const claimGuard = await verifyClaimGuard();

  // M1 step 2 (B 単体実証): shell から call-control RPC を叩き、call view preload 内の実 DOM
  // (対象コントロールの特定と選定理由は call-control-preload.cjs 冒頭コメント参照) を実際にクリック
  // させる。EC の React マウント (ErrorView 到達までの非同期チェーン) 完了まで再試行する。
  // F6: realClickConfirmed の判定基準時刻として、最初の invoke 試行開始時刻を記録しておく
  // (analyzeCallControl() コメント参照)。
  const callControlInvokeStartedAt = Date.now();
  const callControlOutcome = await waitForCallControlInvoke();
  // MutationObserver → IPC push → main 中継が届くまでの猶予。
  await wait(500);
  const callControl = analyzeCallControl(callControlOutcome.result, callControlOutcome.error, callControlInvokeStartedAt);

  const hardNavigationCount = state.navigationEvents.filter((event) => event.isMainFrame && !event.isInPlace).length;
  const sawJoinRequest = acceptedWidgetMessages().some(
    (message) => message.direction === "to-view" && message.data?.api === "toWidget" && message.data?.action === "io.element.join",
  );
  const handshake = analyzeHandshake();

  const result = {
    pass:
      Boolean(sawContentLoaded) &&
      state.callViewState === "attached" &&
      handshake.supportedVersionsIsReal.pass &&
      handshake.capabilitiesNegotiated.pass &&
      acceptedWidgetMessages().some((message) => message.data?.action === "content_loaded") &&
      sawJoinRequest &&
      hardNavigationCount === 1 &&
      Boolean(spoofRejectionObserved) &&
      handshake.spoofRejected &&
      !handshake.spoofLeaked &&
      handshake.unexpectedRejectedCount === 0 &&
      Boolean(claimGuard) &&
      callControl.pass,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    origin: state.origin.replace(/:\d+$/, ":<local-port>"),
    hardNavigationCount,
    sawJoinRequest,
    sawContentLoaded,
    handshake,
    claimGuard,
    callControl,
    cinnyDistExists: fs.existsSync(path.join(cinnyDist, "index.html")),
    ecDistExists: fs.existsSync(path.join(ecDist, "index.html")),
    callViewState: state.callViewState,
    preloadErrors: state.preloadErrors,
    widgetMessages: state.widgetMessages.map((message) => ({
      ...sanitizeEvidenceMessage(message),
    })),
    callControlMessages: state.callControlMessages,
    navigationEvents: state.navigationEvents.map((event) => ({
      ...event,
      url: sanitizeEvidenceString(event.url),
    })),
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "smoke-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

  // M1 step 1 の主目的 (widget-api トランスポート単体の実証) に絞った、より読みやすい専用証跡。
  // 内容は smoke-result.json のサブセットで、pass 判定に関わるフィールドと実メッセージ列だけを残す。
  const handshakeResult = {
    pass: result.pass,
    transportContext:
      "ClientWidgetApi runs in desktop-shell.html's ordinary page-script context (window.mxwidgets from " +
      "matrix-widget-api's browserified dist/api.js, loaded via <script src=/vendor/matrix-widget-api.js>), " +
      "not in a preload script. See shell-widget-host.js header comment for why.",
    sawContentLoaded,
    supportedVersionsIsReal: handshake.supportedVersionsIsReal,
    capabilitiesNegotiated: handshake.capabilitiesNegotiated,
    contentLoadedAcked: handshake.contentLoadedAcked,
    rejectedMessageCount: handshake.rejectedMessageCount,
    spoofRejected: handshake.spoofRejected,
    spoofLeaked: handshake.spoofLeaked,
    unexpectedRejectedCount: handshake.unexpectedRejectedCount,
    claimGuard,
    sawJoinRequest,
    hardNavigationCount,
    actionSequence: handshake.actionSequence,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  };
  fs.writeFileSync(
    path.join(evidenceDir, "handshake-result.json"),
    `${JSON.stringify(handshakeResult, null, 2)}\n`,
    "utf8",
  );

  // M1 step 2 (B 単体実証) 専用の証跡。選定した対象コントロールの特定情報とクリック前後の実測値、
  // 3 つの pass フィールドの根拠 (analyzeCallControl() 参照) をまとめる。
  const callControlResult = {
    pass: callControl.pass,
    deviationsFromDesign:
      "(1) prototype はバックエンド無しのため EC は ErrorView (Room not found) を描画し、ロビー/" +
      "在室 UI (マイク/カメラトグル) には到達しない — CallControl.ts の data-testid セレクタは実在しない。" +
      "(2) CallControl.ts 精読の結果、そもそも toggleMicrophone/toggleVideo は DOM クリックではなく " +
      "widget action (ElementWidgetActions.DeviceMute 経由の transport.send) で実装されており、" +
      "querySelector/.click() が使われるのは screenshare/spotlight/grid/emphasis/reactions/settings 側のみ" +
      "だった。(3) 対象は実在する唯一の操作可能コントロール (ErrorView.tsx の CloseWidgetButton, " +
      '[role="button"][data-kind="primary"], data-testid 無し) を採用。(4) このボタン自身の属性は EC 側では ' +
      "click しても変化しない (host が io.element.close を処理しないため) ので、実クリックイベントを " +
      "起点に preload が data-selfmatrix-pressed 属性を独自にトグルして観測対象にした。詳細は " +
      "call-control-preload.cjs 冒頭コメント参照。(5) 実クリックが EC 本体の DOM に届いたことは、preload " +
      "自身の合成属性観測 (domChanged/statePushSeen) だけでは自己完結してしまい検知できないため、独立" +
      "した傍証として invoke 実行後に受理された io.element.close (from-view) の出現を realClickConfirmed " +
      "として pass 条件に組み込んでいる (F6, 受け入れレビュー修正)。",
    callControlToCallControlTsMapping:
      "screenshareButton ([data-testid=incall_screenshare], 属性 data-kind を監視) / spotlightButton " +
      "(input[value=spotlight], 属性を監視) と同型のパターン (querySelector → .click() → attributes " +
      "MutationObserver) を、実在する唯一の対象 (CloseWidgetButton) に適用した。real な in-call UI に " +
      "差し替わる際は TARGET_SELECTOR と観測属性名を差し替えるだけで良い設計にしてある " +
      "(call-control-preload.cjs)。注意: spotlightButton/emphasisButton は <input> の checkbox/radio で、" +
      "実際に監視すべき checked は DOM 属性ではなくプロパティのため、属性ベースの MutationObserver では " +
      "変化を拾えない (CallControl.ts は click 直後に refreshEmphasisState() で明示的に再読込している)。" +
      "step 3 でこれらの対象に適用する際は同じ対策 (click 後の明示再読取り等) が必要。",
    targetSelector: callControl.targetSelector,
    targetFound: callControl.targetFound,
    action: callControl.action,
    before: callControl.before,
    after: callControl.after,
    rpcRoundTrip: callControl.rpcRoundTrip,
    domChanged: callControl.domChanged,
    statePushSeen: callControl.statePushSeen,
    realClickConfirmed: callControl.realClickConfirmed,
    statePushCount: callControl.statePushCount,
    mutationPushCount: callControl.mutationPushCount,
    invokeError: callControl.invokeError,
    statePushes: callControl.statePushes,
    callControlMessages: state.callControlMessages,
    preloadErrors: state.preloadErrors,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  };
  fs.writeFileSync(
    path.join(evidenceDir, "call-control-result.json"),
    `${JSON.stringify(callControlResult, null, 2)}\n`,
    "utf8",
  );

  state.callWindow?.destroy();
  state.mainWindow?.destroy();
  state.server?.close();
  app.exit(result.pass ? 0 : 1);
}

async function memorySnapshot(label) {
  await wait(700);
  const metrics = app.getAppMetrics().map((metric) => ({
    type: metric.type,
    pid: metric.pid,
    cpuPercent: metric.cpu.percentCPUUsage,
    workingSetSizeKB: metric.memory.workingSetSize,
    peakWorkingSetSizeKB: metric.memory.peakWorkingSetSize,
    privateBytesKB: metric.memory.privateBytes,
  }));
  return {
    label,
    processCount: metrics.length,
    totalWorkingSetSizeKB: metrics.reduce((sum, metric) => sum + (metric.workingSetSizeKB || 0), 0),
    totalPrivateBytesKB: metrics.reduce((sum, metric) => sum + (metric.privateBytesKB || 0), 0),
    metrics,
  };
}

async function injectSyntheticViewerStreams() {
  await ensureCallView();
  return state.callView.webContents.executeJavaScript(
    `(() => {
      const streams = [];
      for (let index = 0; index < 2; index += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d");
        let frame = 0;
        const timer = setInterval(() => {
          ctx.fillStyle = index === 0 ? "#5865f2" : "#2b2d31";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#ffffff";
          ctx.font = "64px sans-serif";
          ctx.fillText("SelfMatrix stream " + (index + 1) + " / " + frame, 80, 160);
          frame += 1;
        }, 1000 / 30);
        const video = document.createElement("video");
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.style.width = "320px";
        video.style.height = "180px";
        video.style.position = "fixed";
        video.style.left = "16px";
        video.style.top = (16 + index * 196) + "px";
        video.srcObject = canvas.captureStream(30);
        document.body.append(video);
        streams.push({ timer, tracks: video.srcObject.getTracks().length });
      }
      window.__selfmatrixMemoryProbeStreams = streams;
      return streams.map((stream) => ({ tracks: stream.tracks }));
    })()`,
    true,
  );
}

async function runMemoryProbe() {
  const snapshots = [];
  await wait(700);
  snapshots.push(await memorySnapshot("shell-only"));

  await ensureCallView();
  const sawContentLoaded = await waitForWidgetAction("content_loaded");
  snapshots.push(await memorySnapshot("call-view-booted"));

  const syntheticStreams = await injectSyntheticViewerStreams();
  snapshots.push(await memorySnapshot("call-view-with-2-synthetic-viewer-streams"));

  const result = {
    pass: snapshots.length === 3 && syntheticStreams.length === 2 && Boolean(sawContentLoaded),
    sawContentLoaded,
    note: "Third snapshot uses two local canvas capture streams in the call renderer. Real LiveKit decode remains an M1 gate.",
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    snapshots,
    syntheticStreams,
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "memory-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  state.callWindow?.destroy();
  state.mainWindow?.destroy();
  state.server?.close();
  app.exit(result.pass ? 0 : 1);
}

async function main() {
  await app.whenReady();
  if (!fs.existsSync(path.join(cinnyDist, "index.html"))) {
    throw new Error(`Cinny dist not found: ${cinnyDist}`);
  }
  if (!fs.existsSync(path.join(ecDist, "index.html"))) {
    throw new Error(`Element Call dist not found: ${ecDist}`);
  }

  setupIpc();
  setupDisplayMediaHandler();
  await startServer();
  createMainWindow();
  if (isSmoke) await runSmoke();
  if (isMemoryProbe) await runMemoryProbe();
}

if (app) {
  main().catch((error) => {
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(
      path.join(evidenceDir, isMemoryProbe ? "memory-result.json" : "smoke-result.json"),
      `${JSON.stringify({ pass: false, error: String(error && error.stack ? error.stack : error) }, null, 2)}\n`,
      "utf8",
    );
    console.error(error);
    app.exit(1);
  });
} else if (require.main === module) {
  throw new Error("native-prototype requires Electron. Use `electron src/main.cjs`.");
}
