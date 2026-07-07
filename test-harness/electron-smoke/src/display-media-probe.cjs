const { app, BrowserWindow, desktopCapturer, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const evidenceDir = path.join(__dirname, "..", "evidence");
const resultPath = path.join(evidenceDir, "display-media-result.json");
const events = [];

function record(type, details = {}) {
  events.push({ t: Date.now(), type, ...details });
}

async function main() {
  await app.whenReady();
  fs.mkdirSync(evidenceDir, { recursive: true });

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    record("display-media-request", {
      videoRequested: Boolean(request.videoRequested),
      audioRequested: Boolean(request.audioRequested),
    });

    desktopCapturer
      .getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } })
      .then((sources) => {
        const source = sources.find((item) => item.id.startsWith("screen:")) || sources[0];
        record("display-media-source-selected", {
          sourceCount: sources.length,
          selectedId: source && source.id,
          selectedName: source && source.name,
        });
        callback({ video: source, audio: false });
      })
      .catch((error) => {
        record("display-media-source-error", { error: String(error && error.stack ? error.stack : error) });
        callback({});
      });
  });

  const win = new BrowserWindow({
    title: "Display Media Smoke",
    width: 900,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  await win.loadFile(path.join(__dirname, "display-media.html"));
  const runResult = await win.webContents.executeJavaScript("window.__runDisplayMediaProbe()", true);
  const finalState = await win.webContents.executeJavaScript(
    "JSON.parse(JSON.stringify(window.__displayMediaState))",
    true,
  );
  const result = {
    pass: Boolean(runResult.ok && runResult.beforeConstraints && runResult.afterConstraints),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    runResult,
    finalState,
    events,
  };

  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  win.destroy();
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
