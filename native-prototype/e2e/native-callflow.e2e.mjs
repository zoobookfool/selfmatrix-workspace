#!/usr/bin/env node
/**
 * SelfMatrix M1 step 3c-2/3c-3 — 2 ユーザー通話 + 配信 + 窓移動無再接続 + 7 語彙実 DOM 検証の E2E。
 *
 * native-join.e2e.mjs (M1 step 3c-1) が実証した「alice 1 人の実ログイン→実 LiveKit join」の先を
 * 検証する。本物のローカル dev Matrix/LiveKit スタックが起動していることを前提に、
 * playwright-core の `_electron` API で prototype の Electron を **2 プロセス** (alice/bob それぞれ
 * 独立した Electron インスタンス、HTTP サーバは各プロセスがポート 0 バインドするため衝突しない)
 * 実起動し、以下を実際に動かして検証する:
 *
 *   1. alice が native-join と同じ経路 (cinny 実ログイン → Voice Lounge → 参加) で join する。
 *   2. bob (2 人目) を 2 個目の Electron インスタンスで同じ経路で join させ、alice 側から見て
 *      2 ユーザー通話が成立したことを実測する (参加者タイル数 + inbound-rtp audio 増加)。
 *   3. alice 側の claim 済み transport から `callControlInvoke` で 7 語彙
 *      (toggleScreenshare/toggleSpotlight/toggleEmphasis/toggleReactions/toggleSettings/
 *      setSoundOff/setSoundOn) を実行し、実 in-call DOM への到達と `onCallControlState` push に
 *      よる再同期 (main の中継記録 + cinny 自身の DOM の両方) を確認する。
 *   4. alice が screenshare 中の状態で、通話 view をメインウィンドウ⇔別ウィンドウ間で 3 往復
 *      再親子付けし、無再接続 (新規 RTCPeerConnection ゼロ・接続維持・メディア継続・bob 側無影響)
 *      であることを実測する。3 往復とも、main.cjs の実際の contentView 階層 (`callViewAttachedTo`,
 *      state 文字列とは独立した積極的証拠) が detach 後に "window"、attach 後に "main" へ実際に
 *      遷移したことも確認する (H1、受け入れレビュー修正 -- state だけ書き換えて実体を動かさない
 *      no-op 化回帰の検知)。
 *   5. cinny (mainWindow) と call view (別 session partition) 間の `matrix-setting-*`
 *      localStorage 契約が分離後も生きるかを実測する (M1 step 3c-2 で発見・修正した契約: 詳細は
 *      README とこのファイル内 `verifyLocalStorageContract()` のコメント参照)。
 *   6. 通話中に画質/FPS 設定を変更した場合、cinny 自身の実 UI (画面共有ボタンの再クリック) が
 *      call view の localStorage を「共有再開のたびに」再同期することを実測する (H3、受け入れ
 *      レビュー修正 -- `verifyMidCallSettingsSync()` 参照。web 版の実契約 (`LocalMember.ts`) との
 *      等価性を狙ったもの)。
 *
 * **絶対条件 (native-join.e2e.mjs と同一)**: 実オーディオデバイス不使用 (fake media)、
 * dev パスワードは環境変数からのみ (`SELFMATRIX_E2E_PASSWORD_ALICE`/`_BOB`)、証跡・ログに
 * パスワードや個人絶対パスを書かない。
 *
 * ログイン/モーダル片付け/ルーム参加/main プロセス内部状態の読み取り/サニタイズといった alice・bob
 * 共通のロジックは `e2e/lib/nativeE2ELib.mjs` に集約されている (native-join.e2e.mjs もこれを使う)。
 *
 * pass 判定は全条件の論理積 (`result.pass`) のみが exit code を左右する — 記録用フィールドが
 * 途中にあっても、それ単体で pass を左右することはない。
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  bridgeDetectedFromSnapshot,
  checkBackendReachable,
  deepSanitize,
  dismissBlockingModals,
  evalInCallView,
  fromViewJoinObserved,
  getMainProcessSnapshot,
  launchNativePrototype,
  loginAsUser,
  makeLogger,
  openVoiceLoungeAndJoin,
  requireEnv,
  resolveElementCallDir,
  ROOM_NAME,
  wait,
  waitForCondition,
} from "./lib/nativeE2ELib.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nativePrototypeDir = path.resolve(__dirname, "..");
const evidenceDir = path.join(nativePrototypeDir, "evidence");

const { log, failFast } = makeLogger("native-callflow-e2e");

const REPARENT_ROUND_TRIPS = 3;
const REPARENT_SETTLE_MS = 800;

// ---- call view 内で評価する再利用スクリプト群 ---------------------------------------------

const PCS_SUMMARY_SCRIPT = `(window.__selfmatrixPcs || []).map((r) => ({
  id: r.id,
  connectionState: r.connectionState,
  iceConnectionState: r.iceConnectionState,
  reachedConnected: r.reachedConnected,
}))`;

// M1 step 3c-2: outbound-rtp (screenshare video) の bytesSent と inbound-rtp (audio) の
// bytesReceived を、注入済み RTCPeerConnection ラッパが保持する生の pc 参照 (r._pc,
// main.cjs の E2E_RTC_WRAPPER_SCRIPT 参照) から getStats() で実測する。LiveKit は publish 用/
// subscribe 用に複数の RTCPeerConnection を使う実装のため、全 pc にわたって集計する。
const RTP_STATS_SCRIPT = `(async () => {
  const pcs = window.__selfmatrixPcs || [];
  let audioBytesReceived = 0;
  let videoBytesReceived = 0;
  let videoBytesSent = 0;
  let audioBytesSent = 0;
  for (const r of pcs) {
    if (!r._pc || typeof r._pc.getStats !== "function") continue;
    let stats;
    try {
      stats = await r._pc.getStats();
    } catch (e) {
      continue;
    }
    stats.forEach((report) => {
      if (report.type === "inbound-rtp" && report.kind === "audio") {
        audioBytesReceived += report.bytesReceived || 0;
      } else if (report.type === "inbound-rtp" && report.kind === "video") {
        videoBytesReceived += report.bytesReceived || 0;
      } else if (report.type === "outbound-rtp" && report.kind === "video") {
        videoBytesSent += report.bytesSent || 0;
      } else if (report.type === "outbound-rtp" && report.kind === "audio") {
        audioBytesSent += report.bytesSent || 0;
      }
    });
  }
  return { audioBytesReceived, videoBytesReceived, videoBytesSent, audioBytesSent, pcCount: pcs.length };
})()`;

// M1 step 3c-3 (実機確認して判明): `MediaView.tsx` 自体は root 要素に
// `data-testid="videoTile"` を付けるが、実際にグリッドへ配置する呼び出し元
// (`PinnableTile.tsx` 経由) がスプレッド展開で `data-testid="tile_pin"` に上書きする
// (JSX の属性展開順序でスプレッドが後勝ちになるため)。実 DOM (2 ユーザー通話) を実測して
// 確認済み — `videoTile` は実際には出現しない。
function participantTileCountScript() {
  return `document.querySelectorAll('[data-testid="tile_pin"]').length`;
}

// ---- 個人ユーザー (alice/bob) の起動〜in-call 到達までを共通化 -------------------------------

async function launchAndJoin(username, password, elementCallDir) {
  const { electronApp, userDataDir } = await launchNativePrototype({ nativePrototypeDir, elementCallDir });
  const page = await electronApp.firstWindow();
  page.setDefaultTimeout(20000);

  await loginAsUser(page, username, password, { log });
  await dismissBlockingModals(page, { log });

  return { electronApp, userDataDir, page };
}

async function waitForInCall(electronApp, label) {
  const conditions = {};

  const bridgeDetected = await waitForCondition(
    `${label}.bridgeDetected`,
    async () => {
      const snapshot = await getMainProcessSnapshot(electronApp);
      return { ok: bridgeDetectedFromSnapshot(snapshot) };
    },
    15000,
    { log },
  );
  conditions.bridgeDetected = bridgeDetected.ok;

  const realJoinObserved = await waitForCondition(
    `${label}.realJoinObserved`,
    async () => {
      const snapshot = await getMainProcessSnapshot(electronApp);
      return { ok: fromViewJoinObserved(snapshot) };
    },
    25000,
    { log },
  );
  conditions.realJoinObserved = realJoinObserved.ok;

  const inCallUi = await waitForCondition(
    `${label}.inCallUi`,
    async () => {
      const evalResult = await evalInCallView(
        electronApp,
        `document.querySelector('[data-testid="incall_leave"]') !== null`,
      );
      return { ok: Boolean(evalResult && evalResult.ok && evalResult.value === true) };
    },
    30000,
    { log },
  );
  conditions.inCallUi = inCallUi.ok;

  const livekitConnected = await waitForCondition(
    `${label}.livekitConnected`,
    async () => {
      const evalResult = await evalInCallView(electronApp, PCS_SUMMARY_SCRIPT);
      const pcs = evalResult && evalResult.ok && Array.isArray(evalResult.value) ? evalResult.value : [];
      return { ok: pcs.some((pc) => pc.reachedConnected) };
    },
    30000,
    { log },
  );
  conditions.livekitConnected = livekitConnected.ok;

  conditions.pass = conditions.bridgeDetected && conditions.realJoinObserved && conditions.inCallUi && conditions.livekitConnected;
  return conditions;
}

// M1 step 3c-2 (媒体継続性の実測を安定させるための対策): screenshare の内容適応エンコーダは
// 「変化なし」を検知するとほぼ即座にフレーム送出を止める (実測、main.cjs の
// registerDisplayMediaHandler コメント参照)。cinny 自身の window (SelfMatrix タイトル) が
// getDisplayMedia() のキャプチャ対象として優先されるようにした (同コメント) 上で、ここで
// その window 上に絶えず変化するオーバーレイを描画し、エンコーダに継続的な差分ソースを与える。
async function startKeepAliveOverlay(page) {
  await page.evaluate(() => {
    if (window.__selfmatrixE2EKeepAlive) return;
    const el = document.createElement("div");
    el.id = "selfmatrix-e2e-keepalive";
    el.style.cssText =
      "position:fixed;top:0;left:0;width:64px;height:64px;z-index:2147483647;pointer-events:none;";
    document.body.appendChild(el);
    let hue = 0;
    const timer = setInterval(() => {
      hue = (hue + 37) % 360;
      el.style.background = `hsl(${hue}, 95%, 50%)`;
      el.textContent = String(Date.now());
    }, 120);
    window.__selfmatrixE2EKeepAlive = timer;
  });
}

async function invokeAliceCallControl(aliceApp, action) {
  return aliceApp.evaluate((_e, act) => {
    if (!global.__selfmatrixE2E || typeof global.__selfmatrixE2E.invokeCallControl !== "function") {
      return { ok: false, reason: "no_e2e_bridge" };
    }
    return global.__selfmatrixE2E.invokeCallControl(act);
  }, action);
}

async function latestStatePush(aliceApp, sinceT) {
  const snapshot = await getMainProcessSnapshot(aliceApp);
  const pushes = (snapshot?.callControlMessages ?? []).filter(
    (m) => m.direction === "state-push" && m.kind === "call-control" && m.t >= sinceT,
  );
  return pushes.length > 0 ? pushes[pushes.length - 1] : null;
}

async function getDomAriaPressed(alicePage, testid) {
  const locator = alicePage.locator(`[data-testid="${testid}"]`);
  const count = await locator.count();
  if (count === 0) return null;
  return locator.first().getAttribute("aria-pressed");
}

// M1 step 3c-3: 7 語彙のうち screenshare/spotlight/emphasis/sound は onCallControlState の
// push で main.cjs 側 (callControlMessages) にも、cinny 自身の再描画 (aria-pressed) にも実際に
// 反映されることを二重に確認する。settings/reactions は CallControlState に対応フィールドが
// 無く push を伴わない元実装 (CallControl.ts) のままなので、push/DOM 再同期の確認対象にしない
// (call-control-preload.cjs 冒頭コメント、cinny の NativeCallControl.ts 参照)。
async function runCallControlVocabulary(aliceApp, alicePage) {
  const vocabulary = {};

  // 1. toggleScreenshare — 配信を開始する (この後の窓移動テストでも ON のまま使う)。
  {
    // 実 getDisplayMedia() が動き出す前に、キャプチャ対象になる cinny 自身の window 上へ
    // keep-alive オーバーレイを仕込んでおく (main.cjs の registerDisplayMediaHandler コメント、
    // startKeepAliveOverlay() コメント参照)。
    await startKeepAliveOverlay(alicePage);
    const before = await getDomAriaPressed(alicePage, "call_control_screenshare");
    const t0 = Date.now();
    const invoke = await invokeAliceCallControl(aliceApp, "toggleScreenshare");
    await wait(1200);
    const push = await latestStatePush(aliceApp, t0);
    const after = await getDomAriaPressed(alicePage, "call_control_screenshare");
    vocabulary.toggleScreenshare = {
      invoke,
      before,
      after,
      statePush: push,
      pass:
        Boolean(invoke.ok && invoke.result && invoke.result.ok === true) &&
        Boolean(push && push.screenshare === true) &&
        after === "true",
    };
  }

  // 2. toggleEmphasis — spotlight に切り替える前 (grid モード) にテストする必要がある
  //    (spotlight 中は emphasis の DOM 要素自体が消える、call-control-preload.cjs 参照)。
  {
    const before = await getDomAriaPressed(alicePage, "call_emphasis_toggle");
    const t0 = Date.now();
    const invoke = await invokeAliceCallControl(aliceApp, "toggleEmphasis");
    await wait(1000);
    const push = await latestStatePush(aliceApp, t0);
    const after = await getDomAriaPressed(alicePage, "call_emphasis_toggle");
    vocabulary.toggleEmphasis = {
      invoke,
      before,
      after,
      statePush: push,
      pass:
        Boolean(invoke.ok && invoke.result && invoke.result.ok === true) &&
        Boolean(push && push.emphasis === true) &&
        after === "true",
    };
  }

  // 3. toggleSpotlight — spotlight へ切り替え、押し戻して grid へ戻す (レイアウトを汚さない)。
  {
    const t0 = Date.now();
    const invokeOn = await invokeAliceCallControl(aliceApp, "toggleSpotlight");
    await wait(1000);
    const pushOn = await latestStatePush(aliceApp, t0);
    const afterOn = await getDomAriaPressed(alicePage, "call_layout_toggle");

    const t1 = Date.now();
    const invokeBack = await invokeAliceCallControl(aliceApp, "toggleSpotlight");
    await wait(1000);
    const pushBack = await latestStatePush(aliceApp, t1);
    const afterBack = await getDomAriaPressed(alicePage, "call_layout_toggle");

    vocabulary.toggleSpotlight = {
      invokeOn,
      invokeBack,
      afterOn,
      afterBack,
      statePushOn: pushOn,
      statePushBack: pushBack,
      pass:
        Boolean(invokeOn.ok && invokeOn.result && invokeOn.result.ok === true) &&
        Boolean(pushOn && pushOn.spotlight === true) &&
        afterOn === "true" &&
        Boolean(invokeBack.ok && invokeBack.result && invokeBack.result.ok === true) &&
        Boolean(pushBack && pushBack.spotlight === false) &&
        afterBack === "false",
    };
  }

  // 4. toggleReactions — 既知の環境ギャップ (詳細は README/報告参照): この EC ビルド
  //    (element-call/src/components/CallFooter.tsx, SelfMatrix fork でリファクタ済み) の footer
  //    には reactions 送信ボタン自体が描画されていない (FooterState.reactionData/
  //    reactionIdentifier は型/state 層にしか存在せず、CallFooter.tsx の JSX では未参照 — dead
  //    props と見られる)。call-control-preload.cjs の reactionsButton() を実機確認したところ、
  //    元の `leaveButton().previousElementSibling` ヒューリスティックは無関係な screenshare
  //    ラッパー div にヒットしていた (このコミットで target_not_found を正直に返すよう修正済み —
  //    call-control-preload.cjs 参照)。実クリック対象が無い以上 {ok:true} にはなり得ないため、
  //    ここでは「action 文字列が語彙として認識されている (unknown_action ではない)」ことだけを
  //    pass 条件にする — この 1 語彙に限り、実 DOM 到達の証明を対象コントロール不在という
  //    環境上の理由でスコープから除外する (native fork 固有の問題ではなく、web 版でも同じ
  //    DOM/コンポーネント構成である以上同様に起こるはずの、EC 本体側の未配線)。
  {
    const invoke = await invokeAliceCallControl(aliceApp, "toggleReactions");
    const reason = invoke.ok && invoke.result ? invoke.result.reason : undefined;
    vocabulary.toggleReactions = {
      invoke,
      knownGap: true,
      knownGapNote:
        "This EC build does not render a reactions button in the footer (FooterState.reactionData/" +
        "reactionIdentifier are unused in CallFooter.tsx's JSX) -- confirmed via source inspection, " +
        "not native-shell specific. call-control-preload.cjs correctly reports target_not_found " +
        "instead of misclicking the neighbouring screenshare wrapper div.",
      // H4 (受け入れレビュー修正、minor): 旧判定は reason !== "unknown_action" だけだったため、
      // call-control-preload.cjs の invoke() 内で例外が発生し reason:"exception" が返ってきても
      // pass:true になってしまっていた (invoke.ok は RPC 往復自体の成否であり、action 自身が
      // 例外で失敗したことを見逃す)。"exception" も明示的に不合格として弾く。
      pass: Boolean(invoke.ok) && reason !== "unknown_action" && reason !== "exception",
    };
  }

  // 5. toggleSettings — パネル開閉 (開いたら閉じる、状態を汚さない)。CallControlState に
  //    対応フィールドが無く push を伴わない (元実装どおり)。
  // 実機確認して判明した食い違い: web 版 CallControl.ts / cinny の CallControls.tsx はどちらも
  // toggleSettings() を「同じボタンを押すたびに開閉が反転する」前提で 1 つの action に統合している
  // (design のカテゴリ B と同型) が、実 EC (element-call/src/settings/SettingsModal.tsx) の設定画面は
  // Compound の Dialog (open/onDismiss で制御) であり、トリガーボタンの 2 回目のクリックは
  // (モーダルに焦点/オーバーレイが奪われるため) ダイアログを閉じない — 実機で 2 回 invoke しても
  // 設定画面が開いたままであることを確認済み (native 固有ではなく EC 本体側の設計、web 版でも同型に
  // 起こるはずの挙動)。テストの後始末としては 2 回目の toggleSettings invoke (契約どおりの 7 語彙の
  // 1 つとして実行すること自体は必須) に加えて、Dialog の標準的な閉じ方 (Escape キー、Radix Dialog
  // の既定動作) で実際に閉じたことまで確認する。
  {
    const invokeOpen = await invokeAliceCallControl(aliceApp, "toggleSettings");
    await wait(500);
    const invokeClose = await invokeAliceCallControl(aliceApp, "toggleSettings");
    await wait(500);
    const stillOpenAfterInvoke = await evalInCallView(
      aliceApp,
      `document.querySelector('[role="dialog"]') !== null`,
    );
    // Dialog の 2 回目クリックでは閉じないことを実機確認済み (上のコメント参照) -- Escape で
    // 実際に閉じ、後片付けする。
    await evalInCallView(
      aliceApp,
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`,
    );
    await wait(500);
    const closedAfterEscape = await evalInCallView(
      aliceApp,
      `document.querySelector('[role="dialog"]') === null`,
    );
    vocabulary.toggleSettings = {
      invokeOpen,
      invokeClose,
      knownGap:
        Boolean(stillOpenAfterInvoke.ok && stillOpenAfterInvoke.value === true) &&
        Boolean(closedAfterEscape.ok && closedAfterEscape.value === true),
      knownGapNote:
        "A second toggleSettings() invoke does not close the Compound Dialog-based settings modal " +
        "(confirmed: dialog was still present via [role=dialog] right after the 2nd invoke) -- " +
        "closed via Escape (Dialog's standard dismissal) for test cleanup instead. Same underlying " +
        "EC component is shared with the web build, so this is not native-shell specific.",
      // H5 (受け入れレビュー修正、minor): 旧判定は invoke の RPC 往復成否 (ok:true) だけを見ており、
      // ダイアログが実際に開いた/Escape で実際に閉じたことまでは確認していなかった (knownGap には
      // 記録していたが pass には反映されていなかった)。stillOpenAfterInvoke/closedAfterEscape を
      // pass の AND に組み込み、「実際にダイアログが開閉した」ことを実測させる (knownGap 記録は
      // そのまま維持する)。
      pass:
        Boolean(invokeOpen.ok && invokeOpen.result && invokeOpen.result.ok === true) &&
        Boolean(invokeClose.ok && invokeClose.result && invokeClose.result.ok === true) &&
        Boolean(stillOpenAfterInvoke.ok && stillOpenAfterInvoke.value === true) &&
        Boolean(closedAfterEscape.ok && closedAfterEscape.value === true),
    };
  }

  // 6. setSoundOff / 7. setSoundOn — 既定 (CallControlState の初期値) は sound:true なので、
  //    off にしてから on に戻す (往復で状態を汚さない)。
  {
    const t0 = Date.now();
    const invokeOff = await invokeAliceCallControl(aliceApp, "setSoundOff");
    await wait(1000);
    const pushOff = await latestStatePush(aliceApp, t0);
    vocabulary.setSoundOff = {
      invoke: invokeOff,
      statePush: pushOff,
      pass:
        Boolean(invokeOff.ok && invokeOff.result && invokeOff.result.ok === true) &&
        Boolean(pushOff && pushOff.sound === false),
    };

    const t1 = Date.now();
    const invokeOn = await invokeAliceCallControl(aliceApp, "setSoundOn");
    await wait(1000);
    const pushOn = await latestStatePush(aliceApp, t1);
    vocabulary.setSoundOn = {
      invoke: invokeOn,
      statePush: pushOn,
      pass:
        Boolean(invokeOn.ok && invokeOn.result && invokeOn.result.ok === true) &&
        Boolean(pushOn && pushOn.sound === true),
    };
  }

  const pass = Object.values(vocabulary).every((entry) => entry.pass);
  return { vocabulary, pass };
}

// M1 step 3c-2 (実機で発覚、対応): この EC ビルドは SelfMatrix の「視聴オプトイン」仕様
// (element-call/src/room/WatchableStreamsBar.tsx, UI 設計合意 v1.4) により、配信 (screenshare)
// は他参加者が明示的に「視聴」ボタン (`data-testid="watch_stream"`) を押すまで購読/描画されない
// (Discord の「配信を見る」相当 — 見ていない配信にはタイルすら割かない設計)。実測したところ、
// 誰も見ていない screenshare は LiveKit のパブリッシャー側が simulcast レイヤーを即座に
// non-active にし、outbound-rtp の bytesSent が初回キーフレーム分だけで頭打ちになる (これは
// SFU の需要ベース帯域制御として正しい挙動)。「配信中に media が流れ続けること」を意味のある形で
// 実測するには、bob 側で実際に「視聴」を opt-in させる必要がある。
async function optInBobToWatchScreenshare(bobApp) {
  const seen = await waitForCondition(
    "bob.watchStreamButtonVisible",
    async () => {
      const r = await evalInCallView(bobApp, `document.querySelector('[data-testid="watch_stream"]') !== null`);
      return { ok: Boolean(r && r.ok && r.value === true) };
    },
    15000,
    { log },
  );
  if (!seen.ok) {
    return { ok: false, reason: "watch_stream_button_not_found" };
  }
  const clickResult = await evalInCallView(
    bobApp,
    `(() => {
      const btn = document.querySelector('[data-testid="watch_stream"]');
      if (!btn) return { ok: false, reason: "target_not_found" };
      btn.click();
      return { ok: true };
    })()`,
  );
  await wait(1500);
  return { ok: Boolean(clickResult && clickResult.ok && clickResult.value && clickResult.value.ok), clickResult };
}

// M1 step 3c-2 (窓移動無再接続、M1 の核心): 通話 view を main window ⇔ 別ウィンドウ間で
// REPARENT_ROUND_TRIPS 回再親子付けし、無再接続であることを実測する。
async function runWindowMoveReparenting(aliceApp, bobApp) {
  const navBefore = (await getMainProcessSnapshot(aliceApp))?.navigationEvents ?? [];
  const hardNavBefore = navBefore.filter((e) => e.isMainFrame && !e.isInPlace).length;
  const pcsBefore = (await evalInCallView(aliceApp, PCS_SUMMARY_SCRIPT)).value ?? [];
  const statsBefore = (await evalInCallView(aliceApp, RTP_STATS_SCRIPT)).value ?? {};
  const bobPcsBefore = (await evalInCallView(bobApp, PCS_SUMMARY_SCRIPT)).value ?? [];
  const bobInCallBefore = await evalInCallView(bobApp, `document.querySelector('[data-testid="incall_leave"]') !== null`);

  const roundTrips = [];
  for (let i = 0; i < REPARENT_ROUND_TRIPS; i += 1) {
    const detach = await aliceApp.evaluate(() => global.__selfmatrixE2E.detachCallView());
    await wait(REPARENT_SETTLE_MS);
    // H1 (受け入れレビュー修正、major): detach.callViewState/attach.callViewState は main.cjs の
    // state.callViewState (文字列) を読んだだけであり、「state だけ書き換えて実際は
    // removeChildView()/addChildView() を呼ばない」no-op 化回帰があっても値は正常に見えてしまう。
    // main.cjs の computeCallViewAttachedTo() (state ではなく実際の contentView.children から
    // 逆算した値、getMainProcessSnapshot() 経由で読める callViewAttachedTo) を別途取得し、
    // detach 後に実際に "window" 側へ、attach 後に実際に "main" 側へ動いたことを実測する。
    const afterDetachSnapshot = await getMainProcessSnapshot(aliceApp);
    const attachedToAfterDetach = afterDetachSnapshot?.callViewAttachedTo ?? null;
    const attach = await aliceApp.evaluate(() => global.__selfmatrixE2E.attachCallView());
    await wait(REPARENT_SETTLE_MS);
    const afterAttachSnapshot = await getMainProcessSnapshot(aliceApp);
    const attachedToAfterAttach = afterAttachSnapshot?.callViewAttachedTo ?? null;
    const detachActuallyMoved = attachedToAfterDetach === "window";
    const attachActuallyMoved = attachedToAfterAttach === "main";
    roundTrips.push({
      i: i + 1,
      detach,
      attach,
      attachedToAfterDetach,
      attachedToAfterAttach,
      detachActuallyMoved,
      attachActuallyMoved,
      pass: detachActuallyMoved && attachActuallyMoved,
    });
    log(
      `window-move round trip ${i + 1}/${REPARENT_ROUND_TRIPS} done ` +
        `(detach=${detach.callViewState}/attachedTo=${attachedToAfterDetach}, ` +
        `attach=${attach.callViewState}/attachedTo=${attachedToAfterAttach}).`,
    );
  }

  await wait(1500); // 少し media が流れる猶予をおいてから after を測る

  const navAfter = (await getMainProcessSnapshot(aliceApp))?.navigationEvents ?? [];
  const hardNavAfter = navAfter.filter((e) => e.isMainFrame && !e.isInPlace).length;
  const pcsAfter = (await evalInCallView(aliceApp, PCS_SUMMARY_SCRIPT)).value ?? [];
  const statsAfter = (await evalInCallView(aliceApp, RTP_STATS_SCRIPT)).value ?? {};
  const bobPcsAfter = (await evalInCallView(bobApp, PCS_SUMMARY_SCRIPT)).value ?? [];
  const bobInCallAfter = await evalInCallView(bobApp, `document.querySelector('[data-testid="incall_leave"]') !== null`);

  const sameIdSet = (a, b) => {
    const idsA = a.map((p) => p.id).sort().join(",");
    const idsB = b.map((p) => p.id).sort().join(",");
    return idsA === idsB;
  };
  const isLive = (pc) =>
    pc.connectionState === "connected" || pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";

  // noReload/pcStable (受け入れレビューで発覚、修正): LiveKit エンジンは実測したところ、実際に
  // 使われる publish/subscribe 用 RTCPeerConnection とは別に、一度も negotiate されず
  // signalingState:"closed" のまま残る PC を生成することがある (connectionState は生涯 "new" の
  // まま — 初期接続時のフォールバック/プリフライト起因と見られ、窓移動より前から既にこの状態)。
  // 「新規 RTCPeerConnection の生成ゼロ」は id 集合が窓移動の前後で完全一致することで判定する
  // (これは生死を問わない — 1 個でも増減すれば新規生成/破棄が起きたことになる)。「既存 PC が
  // connected を維持」は窓移動前に実際に connected だった PC (isLive) だけを対象にする —
  // 生涯 negotiate されない PC にまで connected を要求すると、窓移動と無関係な LiveKit 内部の
  // 未使用 PC の存在だけで無関係に false になってしまう。
  const noReload = hardNavAfter === hardNavBefore && pcsAfter.length === pcsBefore.length && sameIdSet(pcsBefore, pcsAfter);
  const liveBefore = pcsBefore.filter(isLive);
  const liveAfterById = new Map(pcsAfter.map((pc) => [pc.id, pc]));
  const pcStable =
    noReload &&
    liveBefore.length > 0 &&
    liveBefore.every((pc) => {
      const after = liveAfterById.get(pc.id);
      return after && isLive(after);
    });
  const mediaContinues =
    (statsAfter.videoBytesSent ?? 0) > (statsBefore.videoBytesSent ?? 0) &&
    (statsAfter.audioBytesReceived ?? 0) > (statsBefore.audioBytesReceived ?? 0);
  const bobLiveBefore = bobPcsBefore.filter(isLive);
  const bobLiveAfterById = new Map(bobPcsAfter.map((pc) => [pc.id, pc]));
  const bobUnaffected =
    Boolean(bobInCallBefore.ok && bobInCallBefore.value === true) &&
    Boolean(bobInCallAfter.ok && bobInCallAfter.value === true) &&
    bobLiveBefore.length > 0 &&
    bobLiveBefore.every((pc) => {
      const after = bobLiveAfterById.get(pc.id);
      return after && isLive(after);
    });

  // H1 (受け入れレビュー修正、major): 3 往復全部が実際に contentView 階層を動かしたこと
  // (roundTrips[].pass、computeCallViewAttachedTo() 由来) を pass の AND に追加する。
  const allRoundTripsActuallyMoved = roundTrips.every((rt) => rt.pass);

  return {
    roundTrips,
    measurements: {
      hardNavBefore,
      hardNavAfter,
      pcsBefore,
      pcsAfter,
      statsBefore,
      statsAfter,
      bobPcsBefore,
      bobPcsAfter,
    },
    noReload,
    pcStable,
    mediaContinues,
    bobUnaffected,
    allRoundTripsActuallyMoved,
    pass: noReload && pcStable && mediaContinues && bobUnaffected && allRoundTripsActuallyMoved,
  };
}

// M1 step 3c-2 (localStorage 契約の実機確認): cinny (mainWindow) と call view は session
// partition が異なるため (native-prototype/src/main.cjs の CALL_VIEW_PARTITION)、web 版で
// 成立していた「cinny が書く matrix-setting-* を EC が読む」契約 (screenShareSettings.ts /
// element-call/src/settings/settings.ts) が分離後も生きるかは自明ではない -- 実測する。
// このコミット時点でブリッジ (main.cjs の pendingLocalStorageSnapshot / openCallView() 第 2 引数 /
// call-control-preload.cjs の primeLocalStorageFromShell()、cinny の
// collectNativeCallLocalStorageSnapshot()) を実装済みなので、ここでは「実装したブリッジが
// 実機で機能しているか」を検証する。値は実際にスクリーンシェア画質ピッカーが書く実キーを使う
// (screenShareSettings.ts の SCREEN_SHARE_QUALITY_KEY/SCREEN_SHARE_FPS_KEY と同一)。
//
// **タイミングが重要**: `collectNativeCallLocalStorageSnapshot()` は cinny の
// `NativeCallEmbed` コンストラクタ (= cinny 自身の「参加」ボタンを押した瞬間) で一度だけ
// スナップショットを取る (`openCallView()` の呼び出しと同時)。そのため、テスト対象の値は
// **join する前** に localStorage へ書き込んでおかなければならない — join 後に書き込んでも
// 既に送信済みのスナップショットには反映されない (受け入れレビューで実際に踏んだ罠: 最初の
// 実装は in-call になってから値を設定していたため、常に空スナップショットになっていた)。
const LOCAL_STORAGE_CONTRACT_TEST_VALUES = { quality: "720", fps: 30 };

async function primeLocalStorageBeforeJoin(alicePage) {
  const { quality, fps } = LOCAL_STORAGE_CONTRACT_TEST_VALUES;
  await alicePage.evaluate(
    ({ quality: q, fps: f }) => {
      localStorage.setItem("matrix-setting-screen-share-quality", JSON.stringify(q));
      localStorage.setItem("matrix-setting-screen-share-fps", JSON.stringify(f));
    },
    { quality, fps },
  );
}

async function verifyLocalStorageContract(aliceApp) {
  const TEST_QUALITY = LOCAL_STORAGE_CONTRACT_TEST_VALUES.quality;
  const TEST_FPS = LOCAL_STORAGE_CONTRACT_TEST_VALUES.fps;

  const readBack = await evalInCallView(
    aliceApp,
    `({
      quality: localStorage.getItem('matrix-setting-screen-share-quality'),
      fps: localStorage.getItem('matrix-setting-screen-share-fps'),
    })`,
  );

  const snapshot = await getMainProcessSnapshot(aliceApp);
  const bridgeEvents = snapshot?.localStorageBridgeEvents ?? [];
  const primedKeys = bridgeEvents.flatMap((e) => e.keys ?? []);

  const matched =
    Boolean(readBack.ok) &&
    readBack.value?.quality === JSON.stringify(TEST_QUALITY) &&
    readBack.value?.fps === JSON.stringify(TEST_FPS);

  return {
    writtenInCinny: { quality: TEST_QUALITY, fps: TEST_FPS },
    readBackFromCallView: readBack,
    bridgeEvents,
    primedKeys,
    note:
      "Electron session partitions isolate localStorage even for the same origin -- cinny " +
      "(mainWindow, default session) and the call view (CALL_VIEW_PARTITION) do NOT share " +
      "localStorage automatically, unlike same-origin iframes in the web build. This was " +
      "confirmed broken by architecture (verified via isolated probe before the fix existed) " +
      "and is now bridged via NativeCallEmbed.ts's collectNativeCallLocalStorageSnapshot() -> " +
      "openCallView()'s 2nd arg -> main.cjs's pendingLocalStorageSnapshot -> " +
      "call-control-preload.cjs's primeLocalStorageFromShell() (writes before the EC bundle's " +
      "Setting classes read localStorage at module-evaluation time).",
    pass: matched,
  };
}

// H3 (受け入れレビュー修正、major): 「共有開始のたびに localStorage を再同期する」live 契約の
// 実機検証。verifyLocalStorageContract() は join 時点の 1 回きりのスナップショット (pending
// snapshot 経路) しか検証しておらず、通話中の画質/FPS 変更が反映されることまでは確認していなかった。
//
// 重要: この検証は `invokeAliceCallControl(aliceApp, "toggleScreenshare")` (main プロセスの
// invokeCallControl() を直接叩く、call-control-preload.cjs の DOM click だけを起こす経路) を
// 使ってはならない -- それは main 側の RPC 中継を直接叩くだけで、cinny の
// NativeCallControl.toggleScreenshare() (H3 の live 再同期ロジック本体、
// collectNativeCallLocalStorageSnapshot() -> transport.updateCallLocalStorage() を実際に
// 呼ぶ場所) を一切経由しない。そのため cinny 自身の実 UI (Controls.tsx の ScreenShareButton と
// その画質/FPS ピッカー、alicePage 上の要素) を実際にクリックして検証する。
//
// ScreenShareButton の画質/FPS ピッカーは「共有していない」ときにしか開かない
// (Controls.tsx の handleClick: enabled なら即 toggle、そうでなければ popout を開く) ため、
// この関数を呼ぶ時点で screenshare が既に ON であること前提に、一旦オフにしてから新しい
// 設定 (LOCAL_STORAGE_CONTRACT_TEST_VALUES とは異なる値) でオンに戻す (off→on)。
// 選択肢は Controls.tsx の SCREEN_SHARE_QUALITIES ('720'|'1080'|'source') /
// SCREEN_SHARE_FPS_OPTIONS (15|30|60) が実際に描画するチップ (data-testid="ssq_<value>"/
// "ssf_<value>") に一致する値でなければならない -- primeLocalStorageBeforeJoin() が使う
// 720/30 とは異なる組み合わせ (1080/15) を選ぶ。
const MID_CALL_SETTINGS_SYNC_VALUES = { quality: "1080", fps: 15 };

async function verifyMidCallSettingsSync(alicePage, aliceApp) {
  const screenshareButton = alicePage.locator('[data-testid="call_control_screenshare"]');

  // 1. 一旦オフにする (enabled=true の状態でクリックすると即座に toggle、ピッカーは開かない)。
  await screenshareButton.click();
  await wait(1000);
  const afterOff = await screenshareButton.getAttribute("aria-pressed").catch(() => null);

  // 2. 再度クリックしてピッカーを開き、既存の値 (720/30, primeLocalStorageBeforeJoin() 参照) とは
  //    異なる quality/fps を選んでから「配信を開始」する。ss_start の onClick
  //    (Controls.tsx handleStartShare) が setScreenShareQuality/setScreenShareFps で cinny 自身の
  //    localStorage に書き込んだ **直後**に onToggle() = NativeCallControl.toggleScreenshare() を
  //    呼ぶ -- これが H3 の live 再同期を実際にトリガーする実クリックパス。
  await screenshareButton.click();
  await alicePage.locator(`[data-testid="ssq_${MID_CALL_SETTINGS_SYNC_VALUES.quality}"]`).click();
  await alicePage.locator(`[data-testid="ssf_${MID_CALL_SETTINGS_SYNC_VALUES.fps}"]`).click();
  await alicePage.locator('[data-testid="ss_start"]').click();
  await wait(1500);
  const afterOn = await screenshareButton.getAttribute("aria-pressed").catch(() => null);

  const readBack = await evalInCallView(
    aliceApp,
    `({
      quality: localStorage.getItem('matrix-setting-screen-share-quality'),
      fps: localStorage.getItem('matrix-setting-screen-share-fps'),
    })`,
  );

  const matched =
    Boolean(readBack.ok) &&
    readBack.value?.quality === JSON.stringify(MID_CALL_SETTINGS_SYNC_VALUES.quality) &&
    readBack.value?.fps === JSON.stringify(MID_CALL_SETTINGS_SYNC_VALUES.fps);

  return {
    writtenInCinny: MID_CALL_SETTINGS_SYNC_VALUES,
    afterOff,
    afterOn,
    readBackFromCallView: readBack,
    note:
      "Drives cinny's own ScreenShareButton + quality/fps picker (Controls.tsx) via real clicks on " +
      "alicePage, so this actually exercises NativeCallControl.toggleScreenshare()'s live resync " +
      "(collectNativeCallLocalStorageSnapshot() -> transport.updateCallLocalStorage(), awaited " +
      "before the callControlInvoke() RPC click) -- unlike runCallControlVocabulary()'s " +
      "toggleScreenshare check, which bypasses cinny's TS layer entirely via " +
      "global.__selfmatrixE2E.invokeCallControl().",
    pass: afterOff === "false" && afterOn === "true" && matched,
  };
}

async function main() {
  await checkBackendReachable({ log, failFast });
  const alicePassword = requireEnv("SELFMATRIX_E2E_PASSWORD_ALICE", { failFast });
  const bobPassword = requireEnv("SELFMATRIX_E2E_PASSWORD_BOB", { failFast });
  const elementCallDir = resolveElementCallDir({ failFast });

  const result = {
    startedAt: new Date().toISOString(),
    pass: false,
    room: ROOM_NAME,
    steps: {},
    passConditions: {},
    error: null,
  };

  let aliceApp = null;
  let bobApp = null;
  let aliceUserDataDir = null;
  let bobUserDataDir = null;
  let capturedOrigin = null;

  try {
    // ---- 1. alice: native-join と同じ経路で join --------------------------------------------
    log("launching alice's Electron instance (--cinny-shell --e2e-real-join)...");
    const alice = await launchAndJoin("alice", alicePassword, elementCallDir);
    aliceApp = alice.electronApp;
    aliceUserDataDir = alice.userDataDir;
    const alicePage = alice.page;

    // localStorage 契約テスト用の値は、cinny の NativeCallEmbed が openCallView() 呼び出しと
    // 同時にスナップショットを取る「参加」ボタンクリックより **前** に書き込んでおく必要がある
    // (verifyLocalStorageContract() 冒頭コメント参照)。
    await primeLocalStorageBeforeJoin(alicePage);

    const aliceJoinOutcome = await openVoiceLoungeAndJoin(alicePage, { log });
    result.steps.aliceJoin = aliceJoinOutcome;
    if (!aliceJoinOutcome.clickedJoin) {
      throw new Error(`alice could not click cinny's own prescreen Join button (${aliceJoinOutcome.reason})`);
    }

    const aliceInCall = await waitForInCall(aliceApp, "alice");
    result.passConditions.alice = aliceInCall;
    if (!aliceInCall.pass) {
      throw new Error(`alice did not reach a real in-call state: ${JSON.stringify(aliceInCall)}`);
    }
    log("alice is in-call.");

    // ---- 2. bob: 2 個目の Electron インスタンスで同じ経路で join ------------------------------
    log("launching bob's Electron instance (2nd process, --cinny-shell --e2e-real-join)...");
    const bob = await launchAndJoin("bob", bobPassword, elementCallDir);
    bobApp = bob.electronApp;
    bobUserDataDir = bob.userDataDir;
    const bobPage = bob.page;

    const bobJoinOutcome = await openVoiceLoungeAndJoin(bobPage, { log });
    result.steps.bobJoin = bobJoinOutcome;
    if (!bobJoinOutcome.clickedJoin) {
      throw new Error(`bob could not click cinny's own prescreen Join button (${bobJoinOutcome.reason})`);
    }

    const bobInCall = await waitForInCall(bobApp, "bob");
    result.passConditions.bob = bobInCall;
    if (!bobInCall.pass) {
      throw new Error(`bob did not reach a real in-call state: ${JSON.stringify(bobInCall)}`);
    }
    log("bob is in-call.");

    // ---- 3. 2 ユーザー通話成立の判定 ----------------------------------------------------------
    const tileCountCondition = await waitForCondition(
      "twoUserCall.participantTileCount",
      async () => {
        const evalResult = await evalInCallView(aliceApp, participantTileCountScript());
        return { ok: evalResult.ok && evalResult.value === 2, count: evalResult.ok ? evalResult.value : null };
      },
      30000,
      { log },
    );
    const statsT0 = (await evalInCallView(aliceApp, RTP_STATS_SCRIPT)).value ?? {};
    await wait(3000);
    const statsT1 = (await evalInCallView(aliceApp, RTP_STATS_SCRIPT)).value ?? {};
    const audioIncreasing = (statsT1.audioBytesReceived ?? 0) > (statsT0.audioBytesReceived ?? 0);

    const twoUserCallEstablished = {
      participantTileCount: tileCountCondition.count,
      participantTileCountPass: tileCountCondition.ok,
      statsT0,
      statsT1,
      audioIncreasing,
      pass: tileCountCondition.ok && audioIncreasing,
    };
    result.passConditions.twoUserCallEstablished = twoUserCallEstablished;
    log(`twoUserCallEstablished: ${JSON.stringify({ tiles: twoUserCallEstablished.participantTileCount, audioIncreasing })}`);
    if (!twoUserCallEstablished.pass) {
      throw new Error(`two-user call was not established: ${JSON.stringify(twoUserCallEstablished)}`);
    }

    // ---- 4. localStorage 契約の実機確認 (screenshare 開始前に検証しておく) --------------------
    const localStorageContract = await verifyLocalStorageContract(aliceApp);
    result.passConditions.localStorageContract = localStorageContract;
    log(`localStorageContract.pass=${localStorageContract.pass}`);

    // ---- 5. 7 語彙の実 in-call DOM 検証 + state push 再同期 -----------------------------------
    const callControlResult = await runCallControlVocabulary(aliceApp, alicePage);
    result.passConditions.callControlVocabulary = callControlResult;
    log(`callControlVocabulary.pass=${callControlResult.pass}`);

    // ---- 6. H3: 通話中の画質/FPS 設定変更が call view の localStorage に「共有再開のたびに」
    //         反映される live 契約の実機確認 (cinny 自身の実 UI クリック経由)。screenshare は
    //         上のステップ 5 で ON のまま -- ここで off→on し直す (bob の視聴 opt-in はこの後、
    //         新しいストリームに対して行う)。--------------------------------------------------
    const midCallSettingsSync = await verifyMidCallSettingsSync(alicePage, aliceApp);
    result.passConditions.midCallSettingsSync = midCallSettingsSync;
    log(`midCallSettingsSync.pass=${midCallSettingsSync.pass}`);

    // ---- 7. bob に配信の視聴を opt-in させる (SelfMatrix の視聴オプトイン仕様、
    //         「media が流れ続けること」を意味のある形で実測するために必要) --------------------
    const bobWatchOptIn = await optInBobToWatchScreenshare(bobApp);
    result.passConditions.bobWatchOptIn = bobWatchOptIn;
    log(`bobWatchOptIn.ok=${bobWatchOptIn.ok}`);

    // ---- 8. 配信中の窓移動無再接続 (3 往復) ---------------------------------------------------
    const windowMove = await runWindowMoveReparenting(aliceApp, bobApp);
    result.passConditions.windowMoveReparenting = windowMove;
    log(
      `windowMoveReparenting: noReload=${windowMove.noReload} pcStable=${windowMove.pcStable} ` +
        `mediaContinues=${windowMove.mediaContinues} bobUnaffected=${windowMove.bobUnaffected} ` +
        `allRoundTripsActuallyMoved=${windowMove.allRoundTripsActuallyMoved}`,
    );

    result.pass =
      result.passConditions.alice.pass &&
      result.passConditions.bob.pass &&
      result.passConditions.twoUserCallEstablished.pass &&
      result.passConditions.localStorageContract.pass &&
      result.passConditions.callControlVocabulary.pass &&
      result.passConditions.midCallSettingsSync.pass &&
      result.passConditions.bobWatchOptIn.ok &&
      result.passConditions.windowMoveReparenting.pass;

    // ---- 9. 証跡スクリーンショット ------------------------------------------------------------
    const finalSnapshot = await getMainProcessSnapshot(aliceApp);
    capturedOrigin = finalSnapshot?.origin ?? null;

    async function captureCallView(electronApp, filename) {
      try {
        const capture = await electronApp.evaluate(() => {
          if (!global.__selfmatrixE2E) return { ok: false, reason: "no_e2e_bridge" };
          return global.__selfmatrixE2E.captureCallViewPng();
        });
        if (capture && capture.ok) {
          fs.mkdirSync(evidenceDir, { recursive: true });
          fs.writeFileSync(path.join(evidenceDir, filename), Buffer.from(capture.base64, "base64"));
          return true;
        }
        return false;
      } catch (error) {
        return false;
      }
    }

    result.screenshots = {
      // 2 ユーザータイル + 配信中の状態 (この時点で screenshare は ON のまま)。
      aliceTwoUserScreenshare: await captureCallView(aliceApp, "native-callflow-alice-2user-screenshare.png"),
      bobCallView: await captureCallView(bobApp, "native-callflow-bob-callview.png"),
    };
    // 別窓移動中 (detached 状態) の様子も 1 枚残す。
    await aliceApp.evaluate(() => global.__selfmatrixE2E.detachCallView());
    await wait(REPARENT_SETTLE_MS);
    result.screenshots.aliceDetachedMidMove = await captureCallView(aliceApp, "native-callflow-alice-detached.png");
    await aliceApp.evaluate(() => global.__selfmatrixE2E.attachCallView());
    await wait(REPARENT_SETTLE_MS);
  } catch (error) {
    result.error = String(error && error.message ? error.message : error);
    log(`ERROR: ${result.error}`);
  } finally {
    if (aliceApp) await aliceApp.close().catch(() => {});
    if (bobApp) await bobApp.close().catch(() => {});
    if (aliceUserDataDir) fs.rmSync(aliceUserDataDir, { recursive: true, force: true });
    if (bobUserDataDir) fs.rmSync(bobUserDataDir, { recursive: true, force: true });
  }

  result.finishedAt = new Date().toISOString();

  const sanitized = capturedOrigin ? deepSanitize(result, capturedOrigin) : result;
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, "native-callflow-result.json"),
    `${JSON.stringify(sanitized, null, 2)}\n`,
    "utf8",
  );

  log(`pass=${result.pass} -- evidence written to ${path.relative(process.cwd(), evidenceDir)}`);
  process.exit(result.pass ? 0 : 1);
}

main().catch((error) => {
  console.error("[native-callflow-e2e] unhandled error:", error);
  process.exit(1);
});
