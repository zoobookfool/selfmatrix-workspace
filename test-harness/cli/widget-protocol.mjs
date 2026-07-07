#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transcriptDir = path.join(__dirname, "transcripts");

const WIDGET_ID = "selfmatrix-call-widget";
const CALL_ORIGIN = "https://app.selfmatrix.test";
const SHELL_ORIGIN = "https://app.selfmatrix.test";

const scenarios = {
  "preload-voice-join": {
    description: "Widget boot, content_loaded, host join request, and device_mute update.",
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
    description: "Widget reports microphone enabled and camera disabled.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: SHELL_ORIGIN,
    steps: [fromWidget("io.element.device_mute", { audio_enabled: true, video_enabled: false })],
    expectedActions: ["io.element.device_mute"],
  },
  "bridge-origin-mismatch": {
    description: "Fail fast when parentUrl origin does not match the call view origin.",
    callOrigin: CALL_ORIGIN,
    parentOrigin: "https://shell.selfmatrix.test",
    steps: [fromWidget("content_loaded", {})],
    expectedFailure: "origin_mismatch",
  },
};

function fromWidget(action, data) {
  return { api: "fromWidget", action, data };
}

function toWidget(action, data) {
  return { api: "toWidget", action, data };
}

function makeRequest(step, index) {
  return {
    api: step.api,
    widgetId: WIDGET_ID,
    requestId: `widgetapi-harness-${String(index + 1).padStart(3, "0")}`,
    action: step.action,
    data: step.data,
  };
}

function responseFor(request) {
  switch (request.action) {
    case "supported_api_versions":
      return { supported_versions: [] };
    case "content_loaded":
    case "io.element.join":
    case "io.element.device_mute":
    case "im.vector.hangup":
      return {};
    case "get_openid":
      return { state: "blocked" };
    default:
      return { error: { message: `Unknown action: ${request.action}` } };
  }
}

function runScenario(name) {
  const scenario = scenarios[name];
  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`);
  }

  const transcript = {
    scenario: name,
    description: scenario.description,
    widgetId: WIDGET_ID,
    callOrigin: scenario.callOrigin,
    parentOrigin: scenario.parentOrigin,
    pass: false,
    events: [],
  };

  if (scenario.callOrigin !== scenario.parentOrigin) {
    transcript.failure = {
      code: "origin_mismatch",
      message: "Widget targetOrigin must match the call view origin for message-event bridge mode.",
    };
    transcript.pass = scenario.expectedFailure === "origin_mismatch";
    return transcript;
  }

  for (const [index, step] of scenario.steps.entries()) {
    const request = makeRequest(step, index);
    const response = { ...request, response: responseFor(request) };
    transcript.events.push({ direction: step.api, request, response });
  }

  const actions = transcript.events.map((event) => event.request.action);
  const missing = (scenario.expectedActions || []).filter((action) => !actions.includes(action));
  transcript.pass = missing.length === 0 && transcript.events.every((event) => event.response.response);
  if (missing.length > 0) {
    transcript.failure = { code: "missing_actions", missing };
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
