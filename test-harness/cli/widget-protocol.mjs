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
const nativeMain = requireFromCli(path.join(workspaceRoot, "native-prototype", "src", "main.cjs"));
const preloadPath = path.join(workspaceRoot, "native-prototype", "src", "widget-bridge-preload.cjs");

const CALL_ORIGIN = "https://app.selfmatrix.test";
const SHELL_ORIGIN = "https://app.selfmatrix.test";

const scenarios = {
  "preload-voice-join": {
    description: "Widget boot, content_loaded, host join request, and device_mute update through native bridge code.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    steps: [
      fromWidget("supported_api_versions", {}),
      fromWidget("content_loaded", {}),
      toWidget("io.element.join", { audioInput: null, videoInput: null }),
      fromWidget("io.element.device_mute", { audio_enabled: true, video_enabled: false }),
    ],
    expectedActions: ["supported_api_versions", "content_loaded", "io.element.join", "io.element.device_mute"],
  },
  "device-mute": {
    description: "Widget reports microphone enabled and camera disabled through actual preload forwarding.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    steps: [fromWidget("io.element.device_mute", { audio_enabled: true, video_enabled: false })],
    expectedActions: ["io.element.device_mute"],
  },
  "unknown-action": {
    description: "Unknown fromWidget action is rejected by the native implementation response policy.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    steps: [fromWidget("com.selfmatrix.unknown", {})],
    expectedActions: ["com.selfmatrix.unknown"],
    expectedErrorAction: "com.selfmatrix.unknown",
  },
  "bridge-origin-mismatch": {
    description: "Fail fast when parentUrl origin does not match the call view origin.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: "https://shell.selfmatrix.test",
    steps: [fromWidget("content_loaded", {})],
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
};

function fromWidget(action, data) {
  return { api: "fromWidget", action, data };
}

function toWidget(action, data) {
  return { api: "toWidget", action, data };
}

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
  };
}

function runScenario(name) {
  const scenario = scenarios[name];
  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`);
  }

  const callUrl = `${scenario.callOrigin}/ec/index.html`;
  const parentUrl = `${scenario.parentOrigin}/desktop-shell.html`;
  const widgetId = scenario.widgetId || nativeMain.WIDGET_ID;
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

  try {
    nativeMain.assertSameOrigin(callUrl, parentUrl);
  } catch (error) {
    transcript.failure = {
      code: "origin_mismatch",
      message: String(error && error.message ? error.message : error),
    };
    transcript.pass = scenario.expectedFailure === "origin_mismatch";
    return transcript;
  }

  const preload = createPreloadHarness(scenario.callOrigin);
  for (const [index, step] of scenario.steps.entries()) {
    if (step.api === "fromWidget") {
      const request = makeFromWidgetRequest(step, index, widgetId);
      const forwarded = preload.dispatchFromWidget(request, scenario.messageOrigin || scenario.callOrigin);
      const event = handleForwardedMessage(forwarded[0], request, scenario);
      transcript.events.push(event);
      if (!event.validation.ok) {
        transcript.failure = event.validation;
        break;
      }
      if (!request.response) {
        const response = { ...request, response: nativeMain.responseForWidgetRequest(request) };
        const responseForwarded = preload.emitToPreload("widget-api-response", response);
        transcript.events.push(handleForwardedMessage(responseForwarded[0], response, scenario, "response-loopback"));
      }
      continue;
    }

    const request = nativeMain.createWidgetRequest(
      step.action,
      step.data,
      `native-prototype-harness-${String(index + 1).padStart(3, "0")}`,
    );
    const forwarded = preload.emitToPreload("widget-api-to-widget", request);
    transcript.events.push(handleForwardedMessage(forwarded[0], request, scenario));
  }

  if (scenario.expectedFailure) {
    transcript.pass = transcript.failure?.code === scenario.expectedFailure;
    return transcript;
  }

  const requestEvents = transcript.events.filter((event) => event.kind !== "response-loopback");
  const actions = requestEvents.map((event) => event.request.action);
  const missing = (scenario.expectedActions || []).filter((action) => !actions.includes(action));
  const errorEvent = transcript.events.find((event) => event.response?.response?.error);
  const expectedErrorMatched =
    !scenario.expectedErrorAction || errorEvent?.response?.action === scenario.expectedErrorAction;

  transcript.pass =
    missing.length === 0 &&
    expectedErrorMatched &&
    transcript.events.every((event) => event.validation.ok && event.channel === "widget-api-message");
  if (missing.length > 0) {
    transcript.failure = { code: "missing_actions", missing };
  } else if (!expectedErrorMatched) {
    transcript.failure = { code: "missing_expected_error", expectedAction: scenario.expectedErrorAction };
  }
  return transcript;
}

function handleForwardedMessage(ipcMessage, expectedRequest, scenario, kind = "request") {
  if (!ipcMessage) {
    return {
      kind,
      channel: null,
      request: expectedRequest,
      validation: { ok: false, code: "not_forwarded", message: "Preload did not forward the message to IPC." },
    };
  }

  const validation = nativeMain.validateWidgetBridgeMessage(ipcMessage.payload, {
    expectedOrigin: scenario.callOrigin,
    expectedWidgetId: nativeMain.WIDGET_ID,
  });
  return {
    kind,
    channel: ipcMessage.channel,
    request: expectedRequest,
    forwarded: ipcMessage.payload,
    validation,
    response: expectedRequest.response ? expectedRequest : undefined,
  };
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
