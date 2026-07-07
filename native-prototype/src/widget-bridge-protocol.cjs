// Electron 非依存の Matrix Widget API bridge 純関数群。
// main.cjs (Electron 依存) と test-harness/cli/widget-protocol.mjs (Node CLI) の両方から
// require される。electron モジュールへの依存や try/catch シムはここに置かない。

const WIDGET_ID = "selfmatrix-native-prototype-call";

function assertSameOrigin(callUrl, parentUrl) {
  const callOrigin = new URL(callUrl).origin;
  const parentOrigin = new URL(parentUrl).origin;
  if (callOrigin !== parentOrigin) {
    throw new Error(`Widget parentUrl origin must match call view origin: ${parentOrigin} !== ${callOrigin}`);
  }
}

// callOrigin / parentOrigin を別々に受け取れる純関数。production の ecUrl() は両方に
// 同じ origin (state.origin) を渡す薄い呼び出しになる。test-harness はここへ意図的に
// 異なる origin を渡し、assertSameOrigin が実際に呼ばれていることを検証する。
function buildWidgetUrl({
  callOrigin,
  parentOrigin = callOrigin,
  widgetId,
  roomId,
  userId,
  deviceId,
  baseUrl,
  intent,
  preload,
  skipLobby,
  disableVideo,
  hideVideoButton,
  theme,
}) {
  const parentUrl = `${parentOrigin}/desktop-shell.html`;
  const callUrl = `${callOrigin}/ec/index.html`;
  assertSameOrigin(callUrl, parentUrl);
  const params = new URLSearchParams({
    widgetId,
    parentUrl,
    roomId,
    userId,
    deviceId,
    baseUrl,
    intent,
    preload: String(preload),
    skipLobby: String(skipLobby),
    disableVideo: String(disableVideo),
    hideVideoButton: String(hideVideoButton),
    theme,
  });
  return `${callUrl}?${params.toString()}`;
}

function createWidgetRequest(action, data, requestId) {
  return {
    api: "toWidget",
    widgetId: WIDGET_ID,
    requestId,
    action,
    data,
  };
}

function isWidgetApiMessage(data) {
  return (
    data &&
    typeof data === "object" &&
    (data.api === "fromWidget" || data.api === "toWidget") &&
    typeof data.requestId === "string" &&
    typeof data.widgetId === "string" &&
    typeof data.action === "string"
  );
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
      return { error: { message: `Unknown widget action: ${request.action}` } };
  }
}

// 拒否理由は「先勝ち 1 件」ではなく、検出できたものを全部 reasons に積んで返す。
// 呼び出し側は ok===false のとき reasons (常に配列、最低 1 件) を見る。
function validateWidgetBridgeMessage(message, expected) {
  if (!message || typeof message !== "object") {
    return {
      ok: false,
      reasons: [{ code: "invalid_message", message: "Bridge message must be an object." }],
    };
  }

  const reasons = [];

  if (!isWidgetApiMessage(message.data)) {
    reasons.push({ code: "invalid_widget_api_message", message: "Message does not match Widget API shape." });
  }

  if (message.sourceIsSelf !== true) {
    reasons.push({
      code: "source_not_self",
      message: "Bridge message did not originate from the call view's own window (postMessage source mismatch).",
    });
  }

  if (expected.expectedWidgetId && message.data && message.data.widgetId !== expected.expectedWidgetId) {
    reasons.push({
      code: "widget_id_mismatch",
      message: `Unexpected widgetId: ${message.data.widgetId}`,
      expectedWidgetId: expected.expectedWidgetId,
      actualWidgetId: message.data.widgetId,
    });
  }

  if (expected.expectedOrigin && message.origin !== expected.expectedOrigin) {
    reasons.push({
      code: "origin_mismatch",
      message: `Unexpected widget origin: ${message.origin}`,
      expectedOrigin: expected.expectedOrigin,
      actualOrigin: message.origin,
    });
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, reasons: [] };
}

module.exports = {
  WIDGET_ID,
  assertSameOrigin,
  buildWidgetUrl,
  createWidgetRequest,
  isWidgetApiMessage,
  responseForWidgetRequest,
  validateWidgetBridgeMessage,
};
