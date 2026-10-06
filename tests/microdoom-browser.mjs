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
  await page.keyboard.press('2');
  await page.keyboard.press(' ');
  await page.keyboard.press('m');
  await page.keyboard.press('m');
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  await browser.close();
  console.log('MICRODOOM browser smoke: PASS');
} finally {
  server.kill('SIGTERM');
}