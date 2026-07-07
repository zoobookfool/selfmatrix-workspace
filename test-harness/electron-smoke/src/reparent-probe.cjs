const { app, BrowserWindow, WebContentsView } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const evidenceDir = path.join(__dirname, "..", "evidence");
const resultPath = path.join(evidenceDir, "reparent-result.json");
const events = [];

app.on("window-all-closed", () => {
  // Probe exits explicitly after writing evidence.
});

function record(type, details = {}) {
  events.push({ t: Date.now(), type, ...details });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForState(view, predicate, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await view.webContents.executeJavaScript("JSON.parse(JSON.stringify(window.__probeState))", true);
    if (predicate(state)) return state;
    await wait(100);
  }
  throw new Error("Timed out waiting for probe state");
}

function createWindow(title) {
  return new BrowserWindow({
    title,
    width: 900,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
}

async function main() {
  await app.whenReady();
  fs.mkdirSync(evidenceDir, { recursive: true });

  const mainWindow = createWindow("SelfMatrix Smoke Main");
  const callWindow = createWindow("SelfMatrix Smoke Call");
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: `selfmatrix-smoke-${Date.now()}`,
    },
  });

  const navigationEvents = [];
  view.webContents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    navigationEvents.push({ url, isInPlace, isMainFrame });
  });
  view.webContents.on("render-process-gone", (_event, details) => record("render-process-gone", details));

  mainWindow.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 900, height: 600 });
  const probeFile = path.join(__dirname, "reparent-call.html");
  const probeUrl = pathToFileURL(probeFile).href;
  await view.webContents.loadFile(probeFile);

  await waitForState(
    view,
    (state) => state.pcConnectionState === "connected" && state.dataChannelState === "open",
  );

  let owner = mainWindow;
  for (let i = 0; i < 10; i += 1) {
    owner.contentView.removeChildView(view);
    owner = owner === mainWindow ? callWindow : mainWindow;
    owner.contentView.addChildView(view);
    view.setBounds({ x: 0, y: 0, width: 900, height: 600 });
    record("moved", { index: i + 1, owner: owner === mainWindow ? "main" : "call" });
    await wait(200);
  }

  const finalState = await view.webContents.executeJavaScript("JSON.parse(JSON.stringify(window.__probeState))", true);
  const result = {
    pass:
      finalState.loadCount === 1 &&
      finalState.unloads === 0 &&
      finalState.pcConnectionState === "connected" &&
      finalState.dataChannelState === "open" &&
      navigationEvents.filter((event) => event.isMainFrame).length <= 1,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    finalState,
    navigationEvents: navigationEvents.map((event) => ({
      ...event,
      url: event.url === probeUrl ? "file://<selfmatrix-workspace>/test-harness/electron-smoke/src/reparent-call.html" : event.url,
    })),
    events,
  };

  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  mainWindow.destroy();
  callWindow.destroy();
  app.exit(result.pass ? 0 : 1);
}

main().catch((error) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    resultPath,
    `${JSON.stringify({ pass: false, error: String(error && error.stack ? error.stack : error), events }, null, 2)}\n`,
    "utf8",
  );
  app.exit(1);
});
