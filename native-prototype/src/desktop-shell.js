const logEl = document.getElementById("log");
const readyDot = document.getElementById("ready-dot");
const originEl = document.getElementById("origin");
const callStateEl = document.getElementById("call-state");
const bridgeStateEl = document.getElementById("bridge-state");

let bridgeMessageCount = 0;

function log(message, data) {
  const suffix = data ? ` ${JSON.stringify(data)}` : "";
  logEl.textContent = `${new Date().toLocaleTimeString()} ${message}${suffix}\n${logEl.textContent}`.slice(0, 6000);
}

async function refreshStatus() {
  const status = await window.selfmatrixNative.getStatus();
  originEl.textContent = `origin: ${status.origin}`;
  callStateEl.textContent = `call view: ${status.callViewState}`;
  bridgeStateEl.textContent = `bridge: ${bridgeMessageCount} messages`;
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

// M1 step 1 以降、toWidget のカスタム action はもう main 経由のスタブでは送らない。
// shell-widget-host.js が起動した本物の ClientWidgetApi の transport.send() を直接呼ぶ
// (本番の CallEmbed が call.transport.send() を呼ぶのと同じ経路。design §1.3)。
document.getElementById("join-call").addEventListener("click", async () => {
  log("send join");
  try {
    await window.selfmatrixWidgetHost.sendAction("io.element.join", { audioInput: null, videoInput: null });
  } catch (error) {
    log("join request did not resolve (expected without a live LiveKit backend)", { error: String(error) });
  }
});

document.getElementById("mute-call").addEventListener("click", async () => {
  log("send device mute request");
  try {
    await window.selfmatrixWidgetHost.sendAction("io.element.device_mute", {
      audio_enabled: true,
      video_enabled: false,
    });
  } catch (error) {
    log("device_mute request did not resolve", { error: String(error) });
  }
});

document.getElementById("hangup-call").addEventListener("click", async () => {
  log("send hangup");
  try {
    await window.selfmatrixWidgetHost.sendAction("im.vector.hangup", {});
  } catch (error) {
    log("hangup request did not resolve", { error: String(error) });
  }
});

function attachWidgetHostLogging() {
  if (!window.selfmatrixWidgetHost) {
    setTimeout(attachWidgetHostLogging, 50);
    return;
  }
  window.selfmatrixWidgetHost.onMessage((direction, data) => {
    bridgeMessageCount += 1;
    log(`widget ${direction} ${data?.action || "?"}`, { response: Boolean(data?.response) });
    void refreshStatus();
  });
}

attachWidgetHostLogging();
void refreshStatus();
