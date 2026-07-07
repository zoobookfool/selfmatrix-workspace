// Electron 非依存の Matrix Widget API bridge 純関数群。
// main.cjs (Electron 依存) と test-harness/cli/widget-protocol.mjs (Node CLI) の両方から
// require される。electron モジュールへの依存や try/catch シムはここに置かない。

const WIDGET_ID = "selfmatrix-native-prototype-call";

// EC dist へ渡す固定パラメータ群。main.cjs の ecUrl() と、shell 側の widget-config.json
// エンドポイント (shell-widget-host.js が本物の matrix-widget-api Widget を構築する際に使う) の
// 両方から参照される単一の正本。リテラルの重複を避けるためここに集約する。
const WIDGET_ROOM_ID = "!prototype:selfmatrix.test";
const WIDGET_USER_ID = "@prototype:selfmatrix.test";
const WIDGET_DEVICE_ID = "NATIVEPROTOTYPE";
const WIDGET_BASE_URL = "https://matrix.example.invalid";

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

// M1 step 1 以降、このスタブ応答はライブ経路 (main.cjs のルータ) からは呼ばれない。
// 実際の応答は shell 側の本物の ClientWidgetApi / CallWidgetDriver 相当
// (native-prototype/src/shell-widget-host.js の NativeWidgetDriver) が生成する
// (design/native-widget-transport.md §2.1)。この純関数は test-harness/cli/widget-protocol.mjs が
// widget-bridge-preload.cjs の応答折り返し配線 (request→response のラウンドトリップ形状) を単体で
// 検証するためだけに残してある。
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

// shell (信頼できるホスト自身の ClientWidgetApi) → callView 方向の形状検証。
// F2a: この方向は送信元が shell 自身の実装のため M0 由来の validateWidgetBridgeMessage
// (sourceIsSelf / origin チェック) は不要だが、widgetId と api 方向だけは最低限確認する。
// design/native-widget-transport.md の「残存リスク」節にある通り、prototype は cinny を同一
// オリジン iframe として埋め込むため、その子フレームが window.parent 経由で送信 API に触れる
// 余地がある (F2b の claim-once はこれを閉じる主対策、こちらは防御多重化の形状検証)。
// host は toWidget のリクエスト (capabilities ask, notify_capabilities, io.element.join 等) と、
// fromWidget リクエストへの応答 (api は "fromWidget" のまま .response が付く) の両方を送るため、
// api は "toWidget" / "fromWidget" のどちらも許容する。
function validateToViewMessage(message) {
  if (!message || typeof message !== "object") {
    return {
      ok: false,
      reasons: [{ code: "invalid_message", message: "To-view message must be an object." }],
    };
  }

  const reasons = [];

  if (message.widgetId !== WIDGET_ID) {
    reasons.push({
      code: "widget_id_mismatch",
      message: `Unexpected widgetId: ${message.widgetId}`,
      expectedWidgetId: WIDGET_ID,
      actualWidgetId: message.widgetId,
    });
  }

  if (message.api !== "toWidget" && message.api !== "fromWidget") {
    reasons.push({
      code: "invalid_api_direction",
      message: `Unexpected api for a to-view message: ${message.api}`,
    });
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, reasons: [] };
}

module.exports = {
  WIDGET_ID,
  WIDGET_ROOM_ID,
  WIDGET_USER_ID,
  WIDGET_DEVICE_ID,
  WIDGET_BASE_URL,
  assertSameOrigin,
  buildWidgetUrl,
  createWidgetRequest,
  isWidgetApiMessage,
  responseForWidgetRequest,
  validateWidgetBridgeMessage,
  validateToViewMessage,
};
