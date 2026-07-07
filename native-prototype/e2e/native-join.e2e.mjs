#!/usr/bin/env node
/**
 * SelfMatrix M1 step 3c-1 — ネイティブシェルからの実ログイン → 実 LiveKit join E2E。
 *
 * `npm run cinny-shell`(-smoke) までの M1 step 3b は「バックエンド無し」を前提に、cinny の実
 * ログイン画面より先に進めないため widget-api ハンドシェイクを main プロセスから代わりに
 * シミュレートしていた (main.cjs の runCinnyShellSmoke() 冒頭コメント参照)。このスクリプトは
 * 逆に「本物のバックエンド (ローカル dev Matrix/LiveKit スタック) が動いていること」を前提とし、
 * playwright-core の `_electron` API で prototype の Electron を実起動し、
 *   1. cinny のログイン画面で alice として実ログイン
 *   2. 初回起動時のモーダル (FirstRunSetup/VerificationReminder) を閉じる
 *   3. 「Voice Lounge」ボイスルームを (無ければ作成して) 開き、cinny 自身の「参加」ボタンを押す
 *   4. cinny の NativeCallEmbed 経路 (window.selfmatrixNative) 経由で実 Element Call が
 *      call view にロードされ、実 LiveKit SFU に接続することを、main プロセスの内部状態と
 *      call view の DOM/RTCPeerConnection を計装して実測する
 * ところまでを実際に動かして検証する。
 *
 * **前提 (すべて手動/事前に用意しておくこと。npm test には組み込まない理由もここ)**:
 *   - ローカル dev Matrix/LiveKit スタックが起動していること
 *     (`element-call` ディレクトリで `pnpm backend`、Docker が必要)。
 *   - dev ユーザー alice のパスワードを環境変数 `SELFMATRIX_E2E_PASSWORD_ALICE` に設定して
 *     渡すこと。**このスクリプト・証跡・ログにパスワードを平文で書き込むことは絶対にない** —
 *     env 経由でのみ受け取り、Playwright へは `page.fill()` の引数として一度だけ渡す。
 *   - `element-call` ディレクトリで `pnpm install` 済みであること (playwright-core を
 *     glob 解決で借用するため)。
 *
 * 実行手順の詳細は native-prototype/README.md の「E2E: 実ログイン→実 LiveKit join
 * (M1 step 3c-1)」節を参照。
 *
 * **dev/E2E 専用**: Electron 起動引数に `--e2e-real-join` を渡す。main.cjs 側はこのフラグ
 * (isE2ERealJoin) を見て初めて `--ignore-certificate-errors` / `--use-fake-ui-for-media-stream` /
 * `--use-fake-device-for-media-stream` を appendSwitch する (main.cjs 冒頭のコメント参照) —
 * 実オーディオデバイスは絶対に使わない。
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import https from "node:https";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nativePrototypeDir = path.resolve(__dirname, "..");
const evidenceDir = path.join(nativePrototypeDir, "evidence");

const HOMESERVER = "https://synapse.m.localhost";
const ALICE_USERNAME = "alice";
const ROOM_NAME = "Voice Lounge";

const JA_LOGIN_ERROR_PATTERN = /正しくありません|ログインに失敗しました|見つかりませんでした/;

function log(message) {
  console.log(`[native-join-e2e] ${message}`);
}

function failFast(message) {
  console.error(`[native-join-e2e] FAIL (precondition): ${message}`);
  process.exit(1);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- 0. 事前条件チェック -----------------------------------------------------------------

// Node の dns.lookup() (OS getaddrinfo 経由) はこの開発機では "*.m.localhost" のような多段
// サブドメインを解決できない (実測: ENOTFOUND -- curl はホスト名末尾 ".localhost" を DNS 問い合わせ
// 無しでループバックへ特別扱いする実装を持つため curl 単体では気付きにくい)。main.cjs 側は
// Chromium 向けに `--host-resolver-rules` で同じマッピングを強制しているのに合わせ、この
// 事前条件チェックでも同じ前提 (*.m.localhost -> 127.0.0.1) を明示する。
function localhostAwareLookup(hostname, options, callback) {
  if (hostname.endsWith(".m.localhost") || hostname === "localhost") {
    // Node's net/tls "Happy Eyeballs" connect path calls custom lookup functions with
    // options.all=true and expects an array of {address, family} back -- a single
    // (address, family) tuple (the plain dns.lookup() shape) is only valid when options.all
    // is falsy. Support both shapes so this works regardless of Node's internal connect path.
    if (options && typeof options === "object" && options.all) {
      callback(null, [{ address: "127.0.0.1", family: 4 }]);
    } else {
      callback(null, "127.0.0.1", 4);
    }
    return;
  }
  require("node:dns").lookup(hostname, options, callback);
}

function httpsGetJson(url, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false, lookup: localhostAwareLookup }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timed out after ${timeoutMs}ms`)));
  });
}

async function checkBackendReachable() {
  let response;
  try {
    response = await httpsGetJson(`${HOMESERVER}/_matrix/client/versions`);
  } catch (error) {
    failFast(
      `dev Matrix backend is unreachable at ${HOMESERVER} (${error.message}). ` +
        "Start it first: in the element-call checkout, run `pnpm backend` (requires Docker), " +
        "then re-run `npm run e2e:join`. See native-prototype/README.md.",
    );
    return;
  }
  if (response.status !== 200) {
    failFast(
      `dev Matrix backend at ${HOMESERVER} responded with unexpected status ${response.status} ` +
        "for /_matrix/client/versions. Is the right docker compose stack running?",
    );
  }
  log(`backend reachable: ${HOMESERVER} (_matrix/client/versions -> ${response.status})`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    failFast(
      `${name} is required (the dev user's password). Never hardcode it — pass it as an ` +
        `environment variable, e.g. (PowerShell) $env:${name}="..."; npm run e2e:join`,
    );
  }
  return value;
}

function resolveElementCallDir() {
  const dir =
    process.env.SELFMATRIX_ELEMENT_CALL_DIR || path.join(os.homedir(), "Documents", "DiscordSub", "element-call");
  if (!fs.existsSync(dir)) {
    failFast(`element-call checkout not found at ${dir}. Set SELFMATRIX_ELEMENT_CALL_DIR to override.`);
  }
  return dir;
}

// playwright-core is not a native-prototype dependency (this prototype only depends on
// `electron` directly). Rather than adding a second copy, we borrow the one already installed
// under element-call's pnpm store (see README's "Playwright" note in the task brief this
// script implements). The exact pnpm-hashed version directory name varies, so resolve it by
// glob rather than hardcoding a version.
function resolvePlaywrightCore(elementCallDir) {
  const pnpmDir = path.join(elementCallDir, "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmDir)) {
    failFast(`${pnpmDir} not found. Run \`pnpm install\` in the element-call checkout first.`);
  }
  const match = fs.readdirSync(pnpmDir).find((name) => name.startsWith("playwright-core@"));
  if (!match) {
    failFast(`No playwright-core@* directory found under ${pnpmDir}. Run \`pnpm install\` in element-call first.`);
  }
  const pwCoreDir = path.join(pnpmDir, match, "node_modules", "playwright-core");
  if (!fs.existsSync(path.join(pwCoreDir, "index.js"))) {
    failFast(`Resolved playwright-core at ${pwCoreDir} but its index.js is missing.`);
  }
  return pwCoreDir;
}

// ---- cinny UI 操作ヘルパー ---------------------------------------------------------------

async function loginAsAlice(page, password) {
  log("waiting for cinny login form...");
  await page.locator('input[name="usernameInput"]').waitFor({ state: "visible", timeout: 30000 });
  await page.locator('input[name="usernameInput"]').fill(ALICE_USERNAME);
  await page.locator('input[name="passwordInput"]').fill(password);
  log("submitting login form...");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const errorVisible = await page
      .getByText(JA_LOGIN_ERROR_PATTERN)
      .first()
      .isVisible()
      .catch(() => false);
    if (errorVisible) {
      const text = await page.getByText(JA_LOGIN_ERROR_PATTERN).first().innerText().catch(() => "(unknown)");
      throw new Error(`cinny reported a login error: ${text}`);
    }
    const stillOnLoginForm = (await page.locator('input[name="usernameInput"]').count()) > 0;
    if (!stillOnLoginForm) {
      log("login form is gone -- authenticated shell should be mounting.");
      return;
    }
    await wait(300);
  }
  throw new Error("timed out waiting for cinny to leave the login screen after submitting credentials");
}

async function dismissBlockingModals(page) {
  const firstRunSetup = page.locator('[data-testid="first_run_setup"]');
  const firstRunSeen = await firstRunSetup
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (firstRunSeen) {
    log('FirstRunSetup modal detected -- picking "Discord style" and dismissing.');
    await page.locator('[data-testid="fr_discord_style"]').click();
    await firstRunSetup.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  } else {
    log("FirstRunSetup modal did not appear within timeout (already dismissed previously, or skipped).");
  }

  const laterButton = page.getByRole("button", { name: "後で", exact: true });
  const laterSeen = await laterButton
    .waitFor({ state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (laterSeen) {
    log('VerificationReminder modal detected -- clicking "後で" (Later).');
    await laterButton.click();
  } else {
    log("VerificationReminder modal did not appear within timeout (already dismissed previously, or skipped).");
  }
}

// Voice Lounge を (既存なら再利用、無ければ作成して) 開き、cinny 自身のプリスクリーンで
// 「参加」を押すところまで進める。戻り値の `clickedJoin` が false の場合、EC 側の実 join は
// 検証できていない (evidence に理由を残し、後続の pass 条件はすべて false になる)。
async function openVoiceLoungeAndJoin(page) {
  const existingRoom = page.getByText(ROOM_NAME, { exact: true }).first();
  const alreadyExists = await existingRoom
    .waitFor({ state: "visible", timeout: 6000 })
    .then(() => true)
    .catch(() => false);

  let created = false;
  if (alreadyExists) {
    log(`existing "${ROOM_NAME}" room found in the sidebar -- opening it.`);
    await existingRoom.click();
  } else {
    log(`no existing "${ROOM_NAME}" room -- creating one.`);
    await page.getByRole("button", { name: "チャンネルを作成", exact: true }).click();
    await page
      .locator('button[aria-pressed]')
      .filter({ hasText: "ボイスルーム" })
      .first()
      .click();
    await page.locator('input[name="nameInput"]').fill(ROOM_NAME);
    await page.getByRole("button", { name: "作成", exact: true }).click();
    created = true;
  }

  const joinButton = page.getByRole("button", { name: "参加", exact: true });
  const joinButtonSeen = await joinButton
    .waitFor({ state: "visible", timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  if (!joinButtonSeen) {
    return { created, clickedJoin: false, reason: "prescreen_join_button_not_found" };
  }
  log('clicking cinny\'s own "参加" (Join) button -- this constructs NativeCallEmbed.');
  await joinButton.click();
  return { created, clickedJoin: true, reason: null };
}

// ---- main プロセス側の状態を electronApp.evaluate() 経由で覗くヘルパー ------------------------

async function getMainProcessSnapshot(electronApp) {
  return electronApp.evaluate(() => {
    if (!global.__selfmatrixE2E) return null;
    return global.__selfmatrixE2E.getSnapshot();
  });
}

async function evalInCallView(electronApp, code) {
  return electronApp.evaluate(
    (_electron, jsCode) => {
      if (!global.__selfmatrixE2E) return { ok: false, reason: "no_e2e_bridge" };
      return global.__selfmatrixE2E.evalInCallView(jsCode);
    },
    code,
  );
}

function fromViewJoinObserved(snapshot) {
  if (!snapshot) return false;
  return snapshot.widgetMessages.some(
    (message) =>
      message.direction === "from-view" &&
      message.type !== "widget-message-rejected" &&
      message.data &&
      message.data.api === "fromWidget" &&
      message.data.action === "io.element.join",
  );
}

function bridgeDetectedFromSnapshot(snapshot) {
  if (!snapshot) return false;
  const rejected = snapshot.widgetMessages.some((message) => message.type === "call-view-url-rejected");
  return snapshot.callViewState === "attached" && !rejected;
}

async function waitForCondition(label, checkFn, timeoutMs, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await checkFn();
    if (last.ok) {
      log(`${label}: OK (${Date.now() < deadline ? "within" : "at"} timeout).`);
      return last;
    }
    await wait(intervalMs);
  }
  log(`${label}: NOT observed within ${timeoutMs}ms.`);
  return last ?? { ok: false };
}

function sanitizeOrigin(str, origin) {
  if (typeof str !== "string" || !origin) return str;
  const replacement = origin.replace(/:\d+$/, ":<local-port>");
  return str
    .replaceAll(origin, replacement)
    .replaceAll(encodeURIComponent(origin), encodeURIComponent(replacement));
}

// widgetMessages には MatrixRTC の get_openid 応答 (LiveKit JWT 発行用の短命 (1h) OpenID
// bearer token) がそのまま含まれる。パスワードでも長期クレデンシャルでもないが、念のため
// 証跡には残さない (defense in depth)。
const REDACT_KEYS = new Set(["access_token"]);

function deepSanitize(value, origin, key) {
  if (typeof value === "string") {
    if (key && REDACT_KEYS.has(key)) return "<redacted>";
    return sanitizeOrigin(value, origin);
  }
  if (Array.isArray(value)) return value.map((item) => deepSanitize(item, origin));
  if (value && typeof value === "object") {
    const out = {};
    for (const [nestedKey, nested] of Object.entries(value)) out[nestedKey] = deepSanitize(nested, origin, nestedKey);
    return out;
  }
  return value;
}

async function main() {
  await checkBackendReachable();
  const alicePassword = requireEnv("SELFMATRIX_E2E_PASSWORD_ALICE");
  const elementCallDir = resolveElementCallDir();
  const pwCoreDir = resolvePlaywrightCore(elementCallDir);

  log(`resolved playwright-core from element-call's pnpm store (borrowed, not a project dependency).`);

  const pw = require(pwCoreDir);
  const electronPath = require("electron"); // native-prototype's own devDependency

  // 実行のたびに新規の userData ディレクトリを使う: cinny の Matrix セッションは IndexedDB に
  // 永続化されるため、既定の userData を使い回すと 2 回目以降の実行でログイン画面を経由せず
  // 自動的にセッション復元されてしまい、「実ログイン」を検証できなくなる。
  const freshUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "selfmatrix-e2e-userdata-"));

  const result = {
    startedAt: new Date().toISOString(),
    pass: false,
    room: ROOM_NAME,
    steps: {},
    passConditions: {},
    error: null,
  };

  let electronApp = null;
  let screenshotTaken = false;
  let capturedOrigin = null;

  try {
    log("launching Electron (--cinny-shell --e2e-real-join)...");
    electronApp = await pw._electron.launch({
      executablePath: electronPath,
      cwd: nativePrototypeDir,
      args: ["src/main.cjs", "--cinny-shell", "--e2e-real-join", `--user-data-dir=${freshUserDataDir}`],
      env: { ...process.env },
      timeout: 30000,
    });

    const page = await electronApp.firstWindow();
    page.setDefaultTimeout(20000);

    await loginAsAlice(page, alicePassword);
    result.steps.login = { ok: true };

    await dismissBlockingModals(page);
    result.steps.modalsDismissed = { ok: true };

    const joinOutcome = await openVoiceLoungeAndJoin(page);
    result.steps.openVoiceLoungeAndJoin = joinOutcome;
    if (!joinOutcome.clickedJoin) {
      throw new Error(`could not click cinny's own prescreen Join button (${joinOutcome.reason})`);
    }

    // 1. bridgeDetected: NativeCallEmbed が openCallView() を呼び、URL 検証を通過して
    //    call view がロードされたこと。
    const bridgeDetected = await waitForCondition(
      "bridgeDetected",
      async () => {
        const snapshot = await getMainProcessSnapshot(electronApp);
        return { ok: bridgeDetectedFromSnapshot(snapshot), snapshot };
      },
      15000,
    );
    result.passConditions.bridgeDetected = bridgeDetected.ok;

    // 2. realJoinObserved: EC (widget) から io.element.join (fromWidget) が実際に main へ届いた。
    const realJoinObserved = await waitForCondition(
      "realJoinObserved",
      async () => {
        const snapshot = await getMainProcessSnapshot(electronApp);
        return { ok: fromViewJoinObserved(snapshot), snapshot };
      },
      25000,
    );
    result.passConditions.realJoinObserved = realJoinObserved.ok;

    // 3. inCallUi: EC の DOM に in-call マーカーが出現。
    const inCallUi = await waitForCondition(
      "inCallUi",
      async () => {
        const evalResult = await evalInCallView(
          electronApp,
          `document.querySelector('[data-testid="incall_leave"]') !== null`,
        );
        return { ok: Boolean(evalResult && evalResult.ok && evalResult.value === true), evalResult };
      },
      30000,
    );
    result.passConditions.inCallUi = inCallUi.ok;

    // 4. livekitConnected: 注入した RTCPeerConnection ラッパで、少なくとも 1 接続が
    //    connected/completed に到達した。
    const livekitConnected = await waitForCondition(
      "livekitConnected",
      async () => {
        const evalResult = await evalInCallView(
          electronApp,
          `(window.__selfmatrixPcs || []).map((r) => ({
            id: r.id,
            connectionState: r.connectionState,
            iceConnectionState: r.iceConnectionState,
            reachedConnected: r.reachedConnected,
          }))`,
        );
        const pcs = evalResult && evalResult.ok && Array.isArray(evalResult.value) ? evalResult.value : [];
        return { ok: pcs.some((pc) => pc.reachedConnected), pcs, evalResult };
      },
      30000,
    );
    result.passConditions.livekitConnected = livekitConnected.ok;
    result.peerConnections = livekitConnected.pcs ?? [];

    const finalSnapshot = await getMainProcessSnapshot(electronApp);
    capturedOrigin = finalSnapshot?.origin ?? null;
    result.finalSnapshot = {
      callViewState: finalSnapshot?.callViewState ?? null,
      activeWidgetId: finalSnapshot?.activeWidgetId ?? null,
      widgetMessageCount: finalSnapshot?.widgetMessages?.length ?? 0,
      preloadErrorCount: finalSnapshot?.preloadErrors?.length ?? 0,
      // 直近の widgetMessages だけを証跡に残す (SDP/ICE 等の実メディア信号は widget-api を
      // 経由しない -- LiveKit との直接シグナリングであり、ここには載らない)。
      recentWidgetMessages: (finalSnapshot?.widgetMessages ?? []).slice(-30),
    };

    result.pass =
      result.passConditions.bridgeDetected &&
      result.passConditions.realJoinObserved &&
      result.passConditions.inCallUi &&
      result.passConditions.livekitConnected;

    // 5. 証跡スクリーンショット。2 枚撮る:
    //    (a) mainWindow (cinny) 自身 -- BrowserWindow.capturePage() は実測したところ
    //        addChildView() された call view (別 WebContentsView) を合成してくれない
    //        (cinny 自身の Discord 風通話コントロールバー等しか写らない) が、それでも
    //        「実際にボイスルームへ通話中の状態で入っている」cinny 側の見た目の証跡にはなる。
    //    (b) call view (EC) 自身 -- captureCallViewPng() で個別にキャプチャし、EC の実際の
    //        in-call UI (マイクトグル、退出ボタン等) を写す。
    try {
      const pngBase64 = await electronApp.evaluate(async ({ BrowserWindow }) => {
        const [win] = BrowserWindow.getAllWindows();
        if (!win) return null;
        const image = await win.capturePage();
        return image.toPNG().toString("base64");
      });
      if (pngBase64) {
        fs.mkdirSync(evidenceDir, { recursive: true });
        fs.writeFileSync(path.join(evidenceDir, "native-join.png"), Buffer.from(pngBase64, "base64"));
        screenshotTaken = true;
      }
    } catch (error) {
      result.screenshotError = String(error && error.message ? error.message : error);
    }
    try {
      const callViewCapture = await electronApp.evaluate(() => {
        if (!global.__selfmatrixE2E) return { ok: false, reason: "no_e2e_bridge" };
        return global.__selfmatrixE2E.captureCallViewPng();
      });
      if (callViewCapture && callViewCapture.ok) {
        fs.mkdirSync(evidenceDir, { recursive: true });
        fs.writeFileSync(
          path.join(evidenceDir, "native-join-callview.png"),
          Buffer.from(callViewCapture.base64, "base64"),
        );
        result.callViewScreenshotTaken = true;
      } else {
        result.callViewScreenshotTaken = false;
        result.callViewScreenshotError = callViewCapture?.reason ?? "unknown";
      }
    } catch (error) {
      result.callViewScreenshotError = String(error && error.message ? error.message : error);
    }
  } catch (error) {
    result.error = String(error && error.message ? error.message : error);
    log(`ERROR: ${result.error}`);
  } finally {
    if (electronApp) {
      await electronApp.close().catch(() => {});
    }
    fs.rmSync(freshUserDataDir, { recursive: true, force: true });
  }

  result.screenshotTaken = screenshotTaken;
  result.finishedAt = new Date().toISOString();

  // サニタイズ: origin (ローカルポート) を <local-port> に置き換える。パスワードは元々どこにも
  // 入れていない (`alicePassword` は page.fill() の引数として一度使うだけで、result オブジェクトの
  // どのフィールドにも代入していない)。個人絶対パス (electronPath/pwCoreDir/nativePrototypeDir 等)
  // も result には積んでいない。capturedOrigin は electronApp を close() する前に取得済みの値を
  // 使う (close 後に electronApp.evaluate() を呼ぶと失敗するため)。
  const sanitized = capturedOrigin ? deepSanitize(result, capturedOrigin) : result;

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "native-join-result.json"), `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");

  log(`pass=${result.pass} -- evidence written to ${path.relative(process.cwd(), evidenceDir)}`);
  log(`passConditions: ${JSON.stringify(result.passConditions)}`);
  process.exit(result.pass ? 0 : 1);
}

main().catch((error) => {
  console.error("[native-join-e2e] unhandled error:", error);
  process.exit(1);
});
