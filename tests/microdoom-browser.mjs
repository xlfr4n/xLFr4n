import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { stdio: 'ignore' });
try {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('http://127.0.0.1:4173/play/', { waitUntil: 'networkidle' });
  const canvas = page.locator('#game');
  await canvas.waitFor();
  const initial = await page.evaluate(() => document.getElementById('game').getContext('2d').getImageData(0, 0, 320, 200).data.join(','));
  await canvas.click();
  await page.waitForTimeout(250);
  const afterStart = await page.evaluate(() => document.getElementById('game').getContext('2d').getImageData(0, 0, 320, 200).data.join(','));
  if (initial === afterStart) throw new Error('MICRODOOM canvas did not change after start');

  await page.keyboard.down('w');
  await page.waitForTimeout(180);
  await page.keyboard.up('w');
  await page.keyboard.press('m');
  await page.keyboard.press('m');
  await page.keyboard.press('p');
  await page.waitForTimeout(80);
  await page.keyboard.press('p');

  await page.evaluate(() => {
    const save = {
      version: 3,
      state: { time: 12, kills: 0, items: 0, totalItems: 0 },
      player: {
        x: 2.5, y: 2.5, a: 0, hp: 100, armor: 100, armorType: 2,
        ammo: { bullets: 200, shells: 50, rockets: 50, cells: 300 },
        owned: { fist: true, pistol: true, shotgun: true, chaingun: true, rocket: true, plasma: true, bfg: true, chainsaw: true },
        ready: 'pistol', pending: null, weaponState: 'ready', weaponTimer: 0, attackTimer: 0
      },
      doors: [], explored: ['2,2'], enemies: [], pickups: []
    };
    localStorage.setItem('xlfr4n-microdoom-save-v2', JSON.stringify(save));
  });
  await page.keyboard.press('F3');
  await page.waitForTimeout(80);

  for (const key of ['1','2','3','4','5','6','7','8']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(220);
    await page.keyboard.press('Space');
    await page.waitForTimeout(80);
  }

  await page.keyboard.press('F2');
  await page.keyboard.press('F3');
  await page.waitForTimeout(80);
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  await browser.close();
  console.log('MICRODOOM browser smoke: PASS');
} finally {
  server.kill('SIGTERM');
}