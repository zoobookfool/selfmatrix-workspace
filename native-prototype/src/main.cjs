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
const {
  WIDGET_ID,
  assertSameOrigin,
  buildWidgetUrl,
  createWidgetRequest,
  isWidgetApiMessage,
  responseForWidgetRequest,
  validateWidgetBridgeMessage,
} = require("./widget-bridge-protocol.cjs");

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
  widgetRequestIndex: 0,
  navigationEvents: [],
};

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
    roomId: "!prototype:selfmatrix.test",
    userId: "@prototype:selfmatrix.test",
    deviceId: "NATIVEPROTOTYPE",
    baseUrl: "https://matrix.example.invalid",
    intent: "join_existing_voice",
    preload: "true",
    skipLobby: "true",
    disableVideo: "true",
    hideVideoButton: "true",
    theme: "dark",
  });
}

async function ensureCallView() {
  if (state.callView) return;

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "widget-bridge-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: "persist:selfmatrix-native-prototype-call",
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

function widgetRequest(action, data) {
  state.widgetRequestIndex += 1;
  return createWidgetRequest(action, data, `native-prototype-${String(state.widgetRequestIndex).padStart(3, "0")}`);
}

async function sendWidgetAction(action, data) {
  await ensureCallView();
  const request = widgetRequest(action, data || {});
  state.callView.webContents.send("widget-api-to-widget", request);
  return request;
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
  ipcMain.handle("native:send-widget-action", (_event, { action, data }) => sendWidgetAction(action, data));

  ipcMain.on("widget-api-message", (_event, message) => {
    const validation = validateWidgetBridgeMessage(message, {
      expectedOrigin: state.origin,
      expectedWidgetId: WIDGET_ID,
    });
    if (!validation.ok) {
      const rejection = { t: Date.now(), type: "widget-message-rejected", validation, data: message?.data };
      state.widgetMessages.push(rejection);
      state.mainWindow?.webContents.send("native:widget-message", rejection);
      return;
    }

    const entry = { t: Date.now(), ...message };
    state.widgetMessages.push(entry);
    state.mainWindow?.webContents.send("native:widget-message", entry);

    if (message.data?.api === "fromWidget" && !message.data.response) {
      state.callView?.webContents.send("widget-api-response", {
        ...message.data,
        response: responseForWidgetRequest(message.data),
      });
    }
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

async function runSmoke() {
  await ensureCallView();
  const sawContentLoaded = await waitForWidgetAction("content_loaded");
  await detachCallView();
  await wait(250);
  await attachCallView();
  await wait(250);
  await detachCallView();
  await wait(250);
  await attachCallView();
  await sendWidgetAction("io.element.join", { audioInput: null, videoInput: null });
  await wait(500);

  const hardNavigationCount = state.navigationEvents.filter((event) => event.isMainFrame && !event.isInPlace).length;
  const sawJoinRequest = acceptedWidgetMessages().some(
    (message) => message.data?.api === "toWidget" && message.data?.action === "io.element.join",
  );
  const result = {
    pass:
      Boolean(sawContentLoaded) &&
      state.callViewState === "attached" &&
      acceptedWidgetMessages().some((message) => message.data?.action === "supported_api_versions") &&
      acceptedWidgetMessages().some((message) => message.data?.action === "content_loaded") &&
      sawJoinRequest &&
      hardNavigationCount === 1,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    origin: state.origin.replace(/:\d+$/, ":<local-port>"),
    hardNavigationCount,
    sawJoinRequest,
    cinnyDistExists: fs.existsSync(path.join(cinnyDist, "index.html")),
    ecDistExists: fs.existsSync(path.join(ecDist, "index.html")),
    callViewState: state.callViewState,
    widgetMessages: state.widgetMessages.map((message) => ({
      ...sanitizeEvidenceMessage(message),
    })),
    navigationEvents: state.navigationEvents.map((event) => ({
      ...event,
      url: sanitizeEvidenceString(event.url),
    })),
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "smoke-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
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
