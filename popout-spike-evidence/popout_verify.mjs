// ポップアウト技術検証の自動実行スクリプト(使い捨て)。
// element-call/ 直下に置くのは @playwright/test の node_modules 解決のためだけで、
// element-call 自体とは無関係。検証後に削除する。
import { chromium } from './node_modules/.pnpm/playwright-core@1.60.0/node_modules/playwright-core/index.mjs';

const CINNY = 'http://localhost:8080';
const USER = 'alice';
const PASS = process.env.TEST_PASS ?? 'changeme';
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
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1400, height: 900 },
  permissions: ['microphone'],
});

const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(`[main] ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => consoleErrors.push(`[main pageerror] ${String(e).slice(0, 300)}`));

try {
  // --- ログイン ---
  log('goto cinny');
  await page.goto(CINNY, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT_DIR}/01_login.png` });

  const userField = page
    .locator('input[name="usernameInput"], input[name="username"], input[type="text"]')
    .last();
  await userField.waitFor({ timeout: 15000 });
  await userField.fill(USER);
  const passField = page.locator('input[type="password"]').first();
  await passField.fill(PASS);
  await page.getByRole('button', { name: /login/i }).click();
  log('login submitted');

  // ログイン完了 = ホーム画面のナビゲーションが出るまで待つ
  await page.waitForURL(/\/home/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOT_DIR}/02_after_login.png` });

  // 暗号化セットアップ等のダイアログが出ていたら閉じる(スパイクでは不要)
  const dismiss = page.getByRole('button', { name: /skip|later|close|cancel|not now/i }).first();
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click().catch(() => {});
    log('dismissed a dialog');
  }

  // --- ボイスチャンネル (Voice Lounge) へ ---
  const roomNav = page.getByText('Voice Lounge', { exact: false }).first();
  await roomNav.waitFor({ timeout: 20000 });
  await roomNav.click();
  log('clicked Voice Lounge nav item');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/03_room.png` });

  // 開いてしまったダイアログがあれば閉じる
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 通話 join: prescreen の緑の Join ボタン (exact match で "Join with Address" を避ける)
  const joinBtn = page.getByRole('button', { name: 'Join', exact: true }).first();
  if (await joinBtn.isVisible().catch(() => false)) {
    await joinBtn.click();
    log('clicked prescreen Join button');
  }

  // 参加完了 = ポップアウトボタン(通話コントロール)が出るまで
  const popoutBtn = page.locator('[aria-label="Pop out call"]');
  const tJoinStart = Date.now();
  await popoutBtn.waitFor({ timeout: 60000 });
  log(`joined call (controls visible) in ~${Date.now() - tJoinStart}ms after room open`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/04_in_call.png` });

  // --- ポップアウト ---
  const popupPromise = context.waitForEvent('page', { timeout: 15000 });
  const tPopout = Date.now();
  await popoutBtn.click();
  log('clicked popout button');

  const popup = await popupPromise;
  log(`popup window opened after ${Date.now() - tPopout}ms`);
  const popupErrors = [];
  popup.on('console', (m) => {
    if (m.type() === 'error') popupErrors.push(`[popup] ${m.text().slice(0, 300)}`);
  });

  // ポップアップ内に element-call の iframe が入るのを待つ
  const popupIframe = popup.locator('iframe');
  await popupIframe.waitFor({ timeout: 20000 });
  const iframeSrc = await popupIframe.getAttribute('src');
  log('popup iframe src:', (iframeSrc ?? '').slice(0, 120));

  // 再 join 完了 = メインウィンドウの通話コントロールが再表示されるまで
  await popoutBtn.waitFor({ timeout: 60000 });
  const rejoinMs = Date.now() - tPopout;
  log(`REJOINED via popup in ${rejoinMs}ms (click -> controls visible)`);

  await page.screenshot({ path: `${SHOT_DIR}/05_main_during_popout.png` });

  // EC の描画を待ってからポップアップを撮影・検査
  await popup.waitForTimeout(4000);
  await popup.screenshot({ path: `${SHOT_DIR}/06_popup.png` });

  const ecFrame = popup.frames().find((f) => (f.url() ?? '').includes('element-call'));
  if (ecFrame) {
    const tile = await ecFrame.getByText('alice').first().isVisible().catch(() => false);
    log('participant tile (alice) visible in popup:', tile);
    const leave = ecFrame.locator('[data-testid="incall_leave"]');
    const leaveHidden = !(await leave.isVisible().catch(() => false));
    log('EC internal controls hidden by CallControl (expected true):', leaveHidden);
  } else {
    log('WARN: element-call frame not found in popup');
  }

  // --- メインウィンドウからのミュート操作(DeviceMute の往復 = widget 通信の実証) ---
  // mic ボタンは aria-label を持たないので、End ボタンから遡ったコントロールカード内の先頭ボタン
  const micClicked = await page.evaluate(() => {
    const end = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'End');
    if (!end) return false;
    const card = end.parentElement?.parentElement?.parentElement;
    const mic = card?.querySelectorAll('button')?.[0];
    if (!mic) return false;
    mic.click();
    return true;
  });
  if (micClicked) {
    await page.waitForTimeout(2000);
    // toggleMicrophone は widget の応答待ちの間ボタンが disabled になる。解除 = 応答受信
    const micEnabledAgain = await page.evaluate(() => {
      const end = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'End');
      const mic = end?.parentElement?.parentElement?.parentElement?.querySelectorAll('button')?.[0];
      return mic ? !mic.disabled : false;
    });
    log('mic toggle round-trip (DeviceMute response received):', micEnabledAgain);
  } else {
    log('WARN: mic button not found; skipping mute test');
  }

  // --- ポップアップを閉じる → 後片付け確認 ---
  await popup.close();
  log('popup closed');
  // closeWatch は 500ms ポーリング → 合成 Close → atom 破棄 → prescreen に戻るはず
  await popoutBtn.waitFor({ state: 'detached', timeout: 15000 });
  log('call controls disappeared after popup close (cleanup OK)');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/07_after_close.png` });

  console.log('\n===== RESULT =====');
  console.log('rejoin_ms:', rejoinMs);
  console.log('main console errors:', consoleErrors.length);
  consoleErrors.slice(0, 10).forEach((e) => console.log(' ', e));
  console.log('popup console errors:', popupErrors.length);
  popupErrors.slice(0, 10).forEach((e) => console.log(' ', e));
  console.log('VERDICT: PASS');
} catch (e) {
  console.log('\n===== FAILED =====');
  console.log(String(e).slice(0, 2000));
  await page.screenshot({ path: `${SHOT_DIR}/99_failure.png` }).catch(() => {});
  console.log('main console errors:');
  consoleErrors.slice(0, 20).forEach((x) => console.log(' ', x));
  process.exitCode = 1;
} finally {
  await browser.close();
}
