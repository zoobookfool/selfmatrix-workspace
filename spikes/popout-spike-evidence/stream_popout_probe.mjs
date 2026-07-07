// 配信ストリーム・ポップアウト(Discord 方式)の実現可能性プローブ(使い捨て)。
// 核心の検証: EC iframe 内の video の MediaStream を、別ウィンドウの video に
// srcObject 共有して再生し続けられるか。+ adaptiveStream の購読停止挙動。
import { chromium } from './node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/index.mjs';

const CINNY = 'http://localhost:8080';
const SHOT_DIR = process.env.SHOT_DIR ?? '.';
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...a);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

async function loginAndJoin(context, user, pass) {
  const page = await context.newPage();
  await page.goto(CINNY, { waitUntil: 'domcontentloaded' });
  const userField = page
    .locator('input[name="usernameInput"], input[name="username"], input[type="text"]')
    .last();
  await userField.waitFor({ timeout: 15000 });
  await userField.fill(user);
  await page.locator('input[type="password"]').first().fill(pass);
  await page.getByRole('button', { name: /login/i }).click();
  await page.waitForTimeout(6000);
  await page.keyboard.press('Escape');
  const roomNav = page.getByText('Voice Lounge', { exact: false }).first();
  await roomNav.waitFor({ timeout: 30000 }).catch(async (e) => {
    await page.screenshot({ path: `${SHOT_DIR}/s9_${user}_login_stuck.png` });
    throw e;
  });
  await roomNav.click();
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  const joinBtn = page.getByRole('button', { name: 'Join', exact: true }).first();
  if (await joinBtn.isVisible().catch(() => false)) await joinBtn.click();
  // 通話コントロール(End ボタン)が出るまで = 参加完了
  await page.getByRole('button', { name: 'End' }).waitFor({ timeout: 60000 });
  log(`${user}: joined`);
  return page;
}

// コントロールカード内の n 番目のボタンをクリック (0=mic,1=sound,2=video,3=share...)
async function clickControl(page, index) {
  return page.evaluate((i) => {
    const end = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'End');
    const card = end?.parentElement?.parentElement?.parentElement;
    const btn = card?.querySelectorAll('button')?.[i];
    if (!btn) return false;
    btn.click();
    return true;
  }, index);
}

try {
  const ctxA = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 }, permissions: ['microphone', 'camera'] });
  const ctxB = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 }, permissions: ['microphone', 'camera'] });

  const pageA = await loginAndJoin(ctxA, 'alice', process.env.ALICE_PASS ?? 'changeme');
  const pageB = await loginAndJoin(ctxB, 'bob', process.env.BOB_PASS ?? 'changeme');

  pageB.on('console', (m) => {
    if (m.type() === 'error') log('[bob console]', m.text().slice(0, 200));
  });

  // bob がカメラ映像を配信 (fake device の動画)。
  // cinny 側トグルが効かないケースがあったため EC 内部のカメラボタンを直接叩く
  let camOn = false;
  for (let t = 0; t < 15 && !camOn; t += 1) {
    // eslint-disable-next-line no-await-in-loop
    camOn = await pageB.evaluate(() => {
      const doc = document.querySelector('[data-call-embed-container] iframe')?.contentDocument;
      const btn = doc?.querySelector('[data-testid="incall_videomute"]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    // eslint-disable-next-line no-await-in-loop
    if (!camOn) await pageB.waitForTimeout(1000);
  }
  log('bob EC camera button clicked:', camOn);
  await pageB.waitForTimeout(6000);

  // 診断: bob 自身の iframe に自分のカメラ映像が出ているか
  const bobVids = await pageB.evaluate(() => {
    const doc = document.querySelector('[data-call-embed-container] iframe')?.contentDocument;
    return doc
      ? [...doc.querySelectorAll('video')].map((v) => ({ w: v.videoWidth, live: !!v.srcObject?.active, paused: v.paused }))
      : 'no-iframe-doc';
  });
  log('bob own EC videos:', JSON.stringify(bobVids));
  await pageB.screenshot({ path: `${SHOT_DIR}/s0_bob.png` });

  // alice 側 EC iframe に bob の映像 (videoWidth>0 の video) が届くのを待つ
  const findRemoteVideo = () => {
    const iframe = document.querySelector('[data-call-embed-container] iframe');
    const doc = iframe?.contentDocument;
    if (!doc) return null;
    const vids = [...doc.querySelectorAll('video')].map((v, i) => ({
      i,
      w: v.videoWidth,
      h: v.videoHeight,
      live: !!(v.srcObject && v.srcObject.active),
      paused: v.paused,
    }));
    return vids;
  };
  let vids = [];
  for (let t = 0; t < 20; t += 1) {
    vids = (await pageA.evaluate(findRemoteVideo)) ?? [];
    if (vids.some((v) => v.live && v.w > 0)) break;
    await pageA.waitForTimeout(1000);
  }
  log('alice EC videos:', JSON.stringify(vids));
  if (!vids.some((v) => v.live && v.w > 0)) throw new Error('no live remote video in alice EC iframe');

  // === 核心: MediaStream を別ウィンドウの video へ ===
  const popupPromise = ctxA.waitForEvent('page', { timeout: 10000 });
  const mirrorResult = await pageA.evaluate(() => {
    const iframe = document.querySelector('[data-call-embed-container] iframe');
    const doc = iframe.contentDocument;
    const src = [...doc.querySelectorAll('video')].find((v) => v.srcObject?.active && v.videoWidth > 0);
    const popup = window.open('', 'stream_popout_probe', 'popup=yes,width=800,height=470');
    if (!popup) return { ok: false, reason: 'popup blocked' };
    popup.document.title = 'Stream Popout Probe';
    popup.document.body.style.cssText = 'margin:0;background:#000;display:grid;place-items:center;height:100vh';
    const v = popup.document.createElement('video');
    v.autoplay = true;
    v.muted = true;
    v.style.cssText = 'max-width:100%;max-height:100%';
    popup.document.body.append(v);
    try {
      v.srcObject = src.srcObject; // ← cross-realm MediaStream 共有
    } catch (e) {
      return { ok: false, reason: `srcObject assign failed: ${e}` };
    }
    window.__probeVideo = v; // 後続の計測用にメイン window から参照を保持
    return { ok: true, srcW: src.videoWidth, srcH: src.videoHeight };
  });
  log('mirror attempt:', JSON.stringify(mirrorResult));
  if (!mirrorResult.ok) throw new Error(`mirror failed: ${mirrorResult.reason}`);
  const popup = await popupPromise;

  const probeVideo = () =>
    pageA.evaluate(() => {
      const v = window.__probeVideo;
      return v
        ? { w: v.videoWidth, h: v.videoHeight, t: v.currentTime, paused: v.paused, ended: v.ended }
        : null;
    });

  await pageA.waitForTimeout(2000);
  const m1 = await probeVideo();
  await pageA.waitForTimeout(2000);
  const m2 = await probeVideo();
  log('popout video (call visible):', JSON.stringify(m1), '->', JSON.stringify(m2));
  const playingWhileVisible = m2 && m2.w > 0 && m2.t > m1.t;
  log('PLAYING while call visible:', playingWhileVisible);
  await popup.screenshot({ path: `${SHOT_DIR}/s1_popout_playing.png` });

  // === alice がメイン画面で別ページへ移動 (EC iframe が visibility:hidden になる) ===
  // react-router の popstate 経由でクライアントサイド遷移 (フルリロードは通話が死ぬので不可)
  await pageA.evaluate(() => {
    window.history.pushState({}, '', '/direct');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await pageA.waitForTimeout(2000);
  const hiddenState = await pageA.evaluate(() => ({
    url: window.location.pathname,
    containerVisibility:
      document.querySelector('[data-call-embed-container]')?.style.visibility ?? 'missing',
  }));
  log('alice navigated away:', JSON.stringify(hiddenState));
  if (hiddenState.containerVisibility !== 'hidden') {
    log('WARN: call container not hidden — hidden-state measurement is not valid');
  }
  await pageA.waitForTimeout(6000); // adaptiveStream の反応待ち

  const m3 = await probeVideo();
  await pageA.waitForTimeout(3000);
  const m4 = await probeVideo();
  log('popout video (call hidden):', JSON.stringify(m3), '->', JSON.stringify(m4));
  const playingWhileHidden = m4 && m4.w > 0 && m4.t > m3.t;
  log('PLAYING while call hidden (adaptiveStream survival):', playingWhileHidden);
  await popup.screenshot({ path: `${SHOT_DIR}/s2_popout_call_hidden.png` });
  await pageA.screenshot({ path: `${SHOT_DIR}/s3_main_on_home.png` });

  console.log('\n===== RESULT =====');
  console.log('cross-realm srcObject mirror:', mirrorResult.ok ? 'OK' : 'NG');
  console.log('plays while call visible:', playingWhileVisible);
  console.log('plays while call hidden (adaptiveStream):', playingWhileHidden);
  console.log('VERDICT:', mirrorResult.ok && playingWhileVisible ? 'FEASIBLE' : 'NOT FEASIBLE');
} catch (e) {
  console.log('\n===== FAILED =====');
  console.log(String(e).slice(0, 1500));
  process.exitCode = 1;
} finally {
  await browser.close();
}
