const logEl = document.getElementById("log");
const readyDot = document.getElementById("ready-dot");
const originEl = document.getElementById("origin");
const callStateEl = document.getElementById("call-state");
const bridgeStateEl = document.getElementById("bridge-state");

function log(message, data) {
  const suffix = data ? ` ${JSON.stringify(data)}` : "";
  logEl.textContent = `${new Date().toLocaleTimeString()} ${message}${suffix}\n${logEl.textContent}`.slice(0, 6000);
}

async function refreshStatus() {
  const status = await window.selfmatrixNative.getStatus();
  originEl.textContent = `origin: ${status.origin}`;
  callStateEl.textContent = `call view: ${status.callViewState}`;
  bridgeStateEl.textContent = `bridge: ${status.widgetMessageCount} messages`;
  readyDot.classList.toggle("ready", status.callViewState !== "none");
}

document.getElementById("ensure-call").addEventListener("click", async () => {
  log("ensure call view");
  await window.selfmatrixNative.ensureCallView();
  await refreshStatus();
});

document.getElementById("detach-call").addEventListener("click", async () => {
  log("detach call view");
  await window.selfmatrixNative.detachCallView();
  await refreshStatus();
});

document.getElementById("attach-call").addEventListener("click", async () => {
  log("attach call view");
  await window.selfmatrixNative.attachCallView();
  await refreshStatus();
});

document.getElementById("join-call").addEventListener("click", async () => {
  log("send join");
  await window.selfmatrixNative.sendWidgetAction("io.element.join", { audioInput: null, videoInput: null });
});

document.getElementById("mute-call").addEventListener("click", async () => {
  log("send device mute request");
  await window.selfmatrixNative.sendWidgetAction("io.element.device_mute", {
    audio_enabled: true,
    video_enabled: false,
  });
});

document.getElementById("hangup-call").addEventListener("click", async () => {
  log("send hangup");
  await window.selfmatrixNative.sendWidgetAction("im.vector.hangup", {});
});

window.selfmatrixNative.onWidgetMessage((message) => {
  log(`widget ${message.data?.api || "?"}:${message.data?.action || "?"}`, {
    response: Boolean(message.data?.response),
  });
  void refreshStatus();
});

void refreshStatus();
