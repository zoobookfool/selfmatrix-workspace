#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..", "..");
const transcriptDir = path.join(__dirname, "transcripts");
const requireFromCli = createRequire(import.meta.url);
// electron 非依存の純関数群は widget-bridge-protocol.cjs から取る。main.cjs はこれを require
// する薄い委譲になっているので、ここで直接呼ぶことは「main.cjs が使う実装そのもの」を
// 検証することと同じになる (main.cjs 自体は Electron 依存のため CLI からは require しない)。
const protocol = requireFromCli(
  path.join(workspaceRoot, "native-prototype", "src", "widget-bridge-protocol.cjs"),
);
const preloadPath = path.join(workspaceRoot, "native-prototype", "src", "widget-bridge-preload.cjs");

const CALL_ORIGIN = "https://app.selfmatrix.test";
const SHELL_ORIGIN = "https://app.selfmatrix.test";

const WIDGET_URL_PARAMS = {
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
};

function fromWidget(action, data, expect = { outcome: "success" }) {
  return { api: "fromWidget", action, data, expect };
}

function toWidget(action, data) {
  return { api: "toWidget", action, data };
}

const scenarios = {
  "preload-voice-join": {
    description: "Widget boot, content_loaded, host join request, and device_mute update through native bridge code.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    steps: [
      fromWidget("supported_api_versions", {}, { outcome: "success" }),
      fromWidget("content_loaded", {}, { outcome: "success" }),
      toWidget("io.element.join", { audioInput: null, videoInput: null }),
      fromWidget("io.element.device_mute", { audio_enabled: true, video_enabled: false }, { outcome: "success" }),
    ],
    expectedActions: ["supported_api_versions", "content_loaded", "io.element.join", "io.element.device_mute"],
  },
  "device-mute": {
    description: "Widget reports microphone enabled and camera disabled through actual preload forwarding.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    steps: [fromWidget("io.element.device_mute", { audio_enabled: true, video_enabled: false }, { outcome: "success" })],
    expectedActions: ["io.element.device_mute"],
  },
  "get-openid-blocked": {
    description: "get_openid must resolve with state: blocked (native prototype never issues OpenID tokens).",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    steps: [fromWidget("get_openid", {}, { outcome: "success", match: { state: "blocked" } })],
    expectedActions: ["get_openid"],
  },
  "unknown-action": {
    description: "Unknown fromWidget action is rejected by the native implementation response policy.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    steps: [
      fromWidget("com.selfmatrix.unknown", {}, {
        outcome: "error",
        messageIncludes: "Unknown widget action: com.selfmatrix.unknown",
      }),
    ],
    expectedActions: ["com.selfmatrix.unknown"],
  },
  "bridge-origin-mismatch": {
    description:
      "Fail fast when parentUrl origin does not match the call view origin, exercised through buildWidgetUrl() " +
      "— the exact function main.cjs's ecUrl() delegates to (not a re-implementation).",
    callOrigin: CALL_ORIGIN,
    parentOrigin: "https://shell.selfmatrix.test",
    viaBuildWidgetUrl: true,
    expectedFailure: "origin_mismatch",
  },
  "bridge-message-origin-mismatch": {
    description: "Reject Widget API messages whose event origin is not the call view origin.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    messageOrigin: "https://evil.selfmatrix.test",
    steps: [fromWidget("content_loaded", {})],
    expectedFailure: "origin_mismatch",
  },
  "bridge-widget-id-mismatch": {
    description: "Reject Widget API messages whose widgetId does not match the active call view.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    widgetId: "unexpected-widget",
    steps: [fromWidget("content_loaded", {})],
    expectedFailure: "widget_id_mismatch",
  },
  "bridge-source-not-self": {
    description:
      "Reject Widget API messages whose postMessage source is not the call view's own window — a same-origin " +
      "iframe or devtools console could otherwise spoof origin/widgetId and pass validation.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    spoofSource: true,
    steps: [fromWidget("content_loaded", {})],
    expectedFailure: "source_not_self",
  },
};

function makeFromWidgetRequest(step, index, widgetId) {
  return {
    api: step.api,
    widgetId,
    requestId: `widgetapi-harness-${String(index + 1).padStart(3, "0")}`,
    action: step.action,
    data: step.data,
  };
}

function createPreloadHarness(callOrigin) {
  const ipcMessages = [];
  const postedMessages = [];
  const windowListeners = new Map();
  const ipcListeners = new Map();
  const fakeWindow = {
    location: { origin: callOrigin },
    addEventListener(type, handler) {
      windowListeners.set(type, handler);
    },
    postMessage(message, targetOrigin) {
      postedMessages.push({ message, targetOrigin });
      const handler = windowListeners.get("message");
      if (handler) {
        handler({ data: message, origin: callOrigin, source: fakeWindow });
      }
    },
  };
  const fakeIpcRenderer = {
    send(channel, payload) {
      ipcMessages.push({ channel, payload });
    },
    on(channel, handler) {
      ipcListeners.set(channel, handler);
    },
  };

  const context = {
    console,
    require(id) {
      if (id === "electron") return { ipcRenderer: fakeIpcRenderer };
      return requireFromCli(id);
    },
    window: fakeWindow,
  };
  vm.runInNewContext(readFileSync(preloadPath, "utf8"), context, { filename: preloadPath });

  return {
    // source を明示できる版。通常の widget メッセージは自分自身の window から来る
    // (source === fakeWindow) が、devtools やスプーフィングを模すため任意の source を渡せる。
    dispatchFromWidgetRaw(request, origin, source) {
      const before = ipcMessages.length;
      const handler = windowListeners.get("message");
      handler({ data: request, origin, source });
      return ipcMessages.slice(before);
    },
    dispatchFromWidget(request, origin = callOrigin) {
      const before = ipcMessages.length;
      const handler = windowListeners.get("message");
      handler({ data: request, origin, source: fakeWindow });
      return ipcMessages.slice(before);
    },
    emitToPreload(channel, payload) {
      const before = ipcMessages.length;
      const handler = ipcListeners.get(channel);
      if (!handler) throw new Error(`Preload did not register ipcRenderer.on(${channel})`);
      handler({}, payload);
      return ipcMessages.slice(before);
    },
    postedMessages,
    fakeWindow,
  };
}

function checkResponseExpectation(expect, responsePayload) {
  const outcome = responsePayload && responsePayload.error ? "error" : "success";
  if (outcome !== expect.outcome) {
    return {
      ok: false,
      reason: `expected outcome "${expect.outcome}" but got "${outcome}" (response=${JSON.stringify(responsePayload)})`,
    };
  }
  if (expect.outcome === "error" && expect.messageIncludes) {
    const message = (responsePayload && responsePayload.error && responsePayload.error.message) || "";
    if (!message.includes(expect.messageIncludes)) {
      return {
        ok: false,
        reason: `expected error message to include "${expect.messageIncludes}" but got "${message}"`,
      };
    }
  }
  if (expect.match) {
    for (const [key, value] of Object.entries(expect.match)) {
      const actual = responsePayload ? responsePayload[key] : undefined;
      if (actual !== value) {
        return {
          ok: false,
          reason: `expected response.${key} === ${JSON.stringify(value)} but got ${JSON.stringify(actual)}`,
        };
      }
    }
  }
  return { ok: true };
}

function handleForwardedMessage(ipcMessage, expectedRequest, scenario, kind = "request") {
  if (!ipcMessage) {
    return {
      kind,
      channel: null,
      request: expectedRequest,
      validation: { ok: false, reasons: [{ code: "not_forwarded", message: "Preload did not forward the message to IPC." }] },
    };
  }

  const validation = protocol.validateWidgetBridgeMessage(ipcMessage.payload, {
    expectedOrigin: scenario.callOrigin,
    expectedWidgetId: protocol.WIDGET_ID,
  });
  return {
    kind,
    channel: ipcMessage.channel,
    request: expectedRequest,
    forwarded: ipcMessage.payload,
    validation,
  };
}

function runBuildWidgetUrlScenario(scenario, transcript) {
  try {
    const url = protocol.buildWidgetUrl({
      callOrigin: scenario.callOrigin,
      parentOrigin: scenario.parentOrigin,
      widgetId: protocol.WIDGET_ID,
      ...WIDGET_URL_PARAMS,
    });
    transcript.failure = { code: "expected_throw_but_succeeded", url };
    transcript.pass = false;
  } catch (error) {
    transcript.failure = { code: "origin_mismatch", message: String(error && error.message ? error.message : error) };
    transcript.pass = scenario.expectedFailure === "origin_mismatch";
  }
  return transcript;
}

function runScenario(name) {
  const scenario = scenarios[name];
  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`);
  }

  const widgetId = scenario.widgetId || protocol.WIDGET_ID;
  const transcript = {
    scenario: name,
    description: scenario.description,
    widgetId,
    callOrigin: scenario.callOrigin,
    parentOrigin: scenario.parentOrigin,
    messageOrigin: scenario.messageOrigin || scenario.callOrigin,
    pass: false,
    events: [],
  };

  if (scenario.viaBuildWidgetUrl) {
    return runBuildWidgetUrlScenario(scenario, transcript);
  }

  const preload = createPreloadHarness(scenario.callOrigin);
  const stepChecks = [];

  for (const [index, step] of scenario.steps.entries()) {
    if (step.api === "fromWidget") {
      const request = makeFromWidgetRequest(step, index, widgetId);
      const dispatchOrigin = scenario.messageOrigin || scenario.callOrigin;
      const forwarded = scenario.spoofSource
        ? preload.dispatchFromWidgetRaw(request, dispatchOrigin, { spoofed: true })
        : preload.dispatchFromWidget(request, dispatchOrigin);
      const event = handleForwardedMessage(forwarded[0], request, scenario);
      transcript.events.push(event);
      if (!event.validation.ok) {
        transcript.failure = event.validation;
        stepChecks.push({ action: step.action, ok: false, reason: "rejected_by_validation" });
        break;
      }

      const response = { ...request, response: protocol.responseForWidgetRequest(request) };
      const responseForwarded = preload.emitToPreload("widget-api-response", response);
      const responseEvent = handleForwardedMessage(responseForwarded[0], response, scenario, "response-loopback");
      transcript.events.push(responseEvent);

      const responsePayload = responseEvent.forwarded && responseEvent.forwarded.data && responseEvent.forwarded.data.response;
      const check = checkResponseExpectation(step.expect, responsePayload);
      stepChecks.push({ action: step.action, ok: check.ok, reason: check.reason, expect: step.expect, actual: responsePayload });
      continue;
    }

    const request = protocol.createWidgetRequest(
      step.action,
      step.data,
      `native-prototype-harness-${String(index + 1).padStart(3, "0")}`,
    );
    const forwarded = preload.emitToPreload("widget-api-to-widget", request);
    const event = handleForwardedMessage(forwarded[0], request, scenario);
    transcript.events.push(event);
    stepChecks.push({ action: step.action, ok: event.validation.ok, reason: event.validation.ok ? undefined : "not_forwarded" });
  }

  transcript.stepChecks = stepChecks;

  if (scenario.expectedFailure) {
    const reasons = transcript.failure?.reasons || [];
    transcript.pass = reasons.some((reason) => reason.code === scenario.expectedFailure);
    return transcript;
  }

  const requestEvents = transcript.events.filter((event) => event.kind !== "response-loopback");
  const actions = requestEvents.map((event) => event.request.action);
  const missing = (scenario.expectedActions || []).filter((action) => !actions.includes(action));
  const allValidationsOk = transcript.events.every((event) => event.validation.ok);
  const allStepChecksOk = stepChecks.every((check) => check.ok);

  transcript.pass = missing.length === 0 && allValidationsOk && allStepChecksOk;
  if (missing.length > 0) {
    transcript.failure = { code: "missing_actions", missing };
  } else if (!allStepChecksOk) {
    transcript.failure = { code: "response_mismatch", stepChecks: stepChecks.filter((check) => !check.ok) };
  } else if (!allValidationsOk) {
    transcript.failure = { code: "validation_failed", events: transcript.events.filter((event) => !event.validation.ok) };
  }
  return transcript;
}

function parseArgs(argv) {
  const args = {
    all: false,
    scenario: "preload-voice-join",
    writeTranscripts: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--all") args.all = true;
    else if (arg === "--write-transcripts") args.writeTranscripts = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--scenario") {
      args.scenario = argv[i + 1];
      i += 1;
    } else if (arg === "--list") {
      args.list = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function writeTranscript(result) {
  await mkdir(transcriptDir, { recursive: true });
  await writeFile(path.join(transcriptDir, `${result.scenario}.json`), `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      console.log(`${name}\t${scenario.description}`);
    }
    return;
  }

  const names = args.all ? Object.keys(scenarios) : [args.scenario];
  const results = names.map(runScenario);

  if (args.writeTranscripts) {
    await Promise.all(results.map(writeTranscript));
  }

  const allPassed = results.every((result) => result.pass);
  if (args.json || !allPassed) {
    console.log(JSON.stringify(args.all ? results : results[0], null, 2));
  } else {
    for (const result of results) {
      console.log(`PASS ${result.scenario}`);
    }
  }

  if (!allPassed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
