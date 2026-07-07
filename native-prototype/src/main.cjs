const { app, BrowserWindow, WebContentsView, desktopCapturer, ipcMain, session } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const evidenceDir = path.join(appRoot, "evidence");
const isSmoke = process.argv.includes("--smoke");

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

app.on("window-all-closed", () => {
  if (!isSmoke) app.quit();
});

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

function responseForWidgetRequest(request) {
  switch (request.action) {
    case "supported_api_versions":
      return { supported_versions: [] };
    case "content_loaded":
    case "io.element.device_mute":
    case "im.vector.hangup":
    case "org.matrix.msc2974.request_capabilities":
      return {};
    case "get_openid":
      return { state: "blocked" };
    default:
      return {};
  }
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
  const params = new URLSearchParams({
    widgetId: "selfmatrix-native-prototype-call",
    parentUrl: `${state.origin}/desktop-shell.html`,
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
  return `${state.origin}/ec/index.html?${params.toString()}`;
}

async function ensureCallView() {
  if (state.callView) return;

  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, "widget-bridge-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
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
  return {
    api: "toWidget",
    widgetId: "selfmatrix-native-prototype-call",
    requestId: `native-prototype-${String(state.widgetRequestIndex).padStart(3, "0")}`,
    action,
    data,
  };
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
        callback({ video: source, audio: false });
      })
      .catch(() => callback({}));
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWidgetAction(action, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (state.widgetMessages.some((message) => message.data?.action === action)) return true;
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
  const sawJoinRequest = state.widgetMessages.some(
    (message) => message.data?.api === "toWidget" && message.data?.action === "io.element.join",
  );
  const result = {
    pass:
      Boolean(sawContentLoaded) &&
      state.callViewState === "attached" &&
      state.widgetMessages.some((message) => message.data?.action === "supported_api_versions") &&
      state.widgetMessages.some((message) => message.data?.action === "content_loaded") &&
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
      ...message,
      origin: typeof message.origin === "string" ? message.origin.replace(/:\d+$/, ":<local-port>") : message.origin,
    })),
    navigationEvents: state.navigationEvents.map((event) => ({
      ...event,
      url: event.url.replace(state.origin, "http://127.0.0.1:<local-port>"),
    })),
  };
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "smoke-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
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
}

main().catch((error) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, "smoke-result.json"),
    `${JSON.stringify({ pass: false, error: String(error && error.stack ? error.stack : error) }, null, 2)}\n`,
    "utf8",
  );
  console.error(error);
  app.exit(1);
});
