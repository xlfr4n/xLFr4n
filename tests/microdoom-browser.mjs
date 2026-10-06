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
  const startButton = page.getByRole('button', { name: /START MISSION/ });
  const optionsButton = page.getByRole('button', { name: /OPTIONS/ }).first();
  await canvas.waitFor();
  await page.locator('#game-ui').waitFor();
  if (!(await startButton.isVisible())) throw new Error('Title menu is not visible');
  const initial = await page.evaluate(() => document.getElementById('game').getContext('2d').getImageData(0, 0, 320, 200).data.join(','));
  await optionsButton.click();
  const sensitivity = page.locator('#setting-sensitivity');
  if (!(await sensitivity.isVisible())) throw new Error('Options menu did not open');
  const initialSettings = await page.evaluate(() => JSON.parse(localStorage.getItem('xlfr4n-microdoom-settings-v2') || 'null'));
  if (initialSettings !== null && Math.abs(initialSettings.mouseSensitivity - 0.00075) > 0.000001) {
    throw new Error('Microdoom default mouse sensitivity was not applied');
  }
  await sensitivity.fill('45');
  const savedSensitivity = await page.evaluate(() => JSON.parse(localStorage.getItem('xlfr4n-microdoom-settings-v2')));
  if (Math.abs(savedSensitivity.mouseSensitivity - 0.00045) > 0.000001) throw new Error('Mouse sensitivity did not persist');
  await page.getByRole('button', { name: /DONE/ }).click();
  await startButton.click();
  await page.waitForTimeout(250);
  const afterStart = await page.evaluate(() => document.getElementById('game').getContext('2d').getImageData(0, 0, 320, 200).data.join(','));
  if (initial === afterStart) throw new Error('MICRODOOM canvas did not change after start');

  await page.keyboard.down('w');
  await page.waitForTimeout(180);
  await page.keyboard.up('w');
  await page.keyboard.press('m');
  await page.keyboard.press('m');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  if (!(await page.getByRole('button', { name: /RESUME/ }).isVisible())) throw new Error('ESC did not open the pause menu');
  await page.locator('[data-menu="pause"]').getByRole('button', { name: /OPTIONS/ }).click();
  if (!(await page.locator('#setting-sensitivity').isVisible())) throw new Error('Pause options did not open');
  await page.keyboard.press('Escape');
  if (!(await page.getByRole('button', { name: /RESUME/ }).isVisible())) throw new Error('ESC did not return from options to pause');
  await page.getByRole('button', { name: /RESUME/ }).click();
  await page.waitForTimeout(80);


  await page.evaluate(() => {
    const save = {
      version: 3,
      state: { time: 12, kills: 0, items: 0, totalKills: 12, totalItems: 1, automap: false },
      player: {
        x: 2.5, y: 2.5, a: 0, hp: 100, armor: 100, armorType: 2,
        ammo: { bullets: 200, shells: 50, rockets: 50, cells: 300 },
        owned: { fist: true, pistol: true, shotgun: false, chaingun: false, rocket: false, plasma: false, bfg: false, chainsaw: false },
        ready: 'pistol', pending: null, weaponState: 'ready', weaponTimer: 0, attackTimer: 0
      },
      doors: [], explored: ['2,2'], enemies: [],
      pickups: [{ type: 'shotgun', x: 2.5, y: 2.5, value: 1, taken: false, phase: 0 }]
    };
    localStorage.setItem('xlfr4n-microdoom-save-v2', JSON.stringify(save));
  });
  await page.keyboard.press('F3');
  await page.waitForTimeout(300);
  await page.keyboard.press('F2');
  const weaponPickupState = await page.evaluate(() => JSON.parse(localStorage.getItem('xlfr4n-microdoom-save-v2')));
  if (weaponPickupState.player.ready !== 'shotgun' || weaponPickupState.player.weaponState !== 'ready' || !weaponPickupState.pickups[0]?.taken) {
    throw new Error('Weapon pickup did not complete the switch state machine');
  }

  await page.evaluate(() => {
    const types = ['zombieman','shotguy','imp','zombieman','demon','imp','zombieman','demon','imp','cacodemon','baron','zombieman'];
    const enemies = types.map((type, index) => ({
      index,
      x: index === 0 ? 9.5 : 2.5,
      y: index === 0 ? 2.5 : 1.5,
      hp: index === 0 ? 20 : 0,
      maxHp: index === 0 ? 20 : 30,
      alive: index === 0,
      type,
      cd: 999,
      targetIndex: null
    }));
    const save = {
      version: 3,
      state: { time: 0, kills: 11, items: 0, totalKills: 12, totalItems: 0, automap: false },
      player: {
        x: 2.5, y: 2.5, a: 0, hp: 100, armor: 0, armorType: 0,
        ammo: { bullets: 50, shells: 20, rockets: 2, cells: 100 },
        owned: { fist: true, pistol: true, shotgun: true, chaingun: true, rocket: true, plasma: true, bfg: true, chainsaw: true },
        ready: 'rocket', pending: null, weaponState: 'ready', weaponTimer: 0, attackTimer: 0
      },
      doors: [], explored: ['2,2'], enemies,
      pickups: []
    };
    localStorage.setItem('xlfr4n-microdoom-save-v2', JSON.stringify(save));
  });
  await page.keyboard.press('F3');
  await page.waitForTimeout(120);
  await page.keyboard.press('Space');
  await page.waitForTimeout(1400);
  await page.keyboard.press('F2');
  const projectileState = await page.evaluate(() => JSON.parse(localStorage.getItem('xlfr4n-microdoom-save-v2')));
  if (projectileState.state.kills !== 12 || projectileState.player.ammo.rockets !== 1) {
    throw new Error('Rocket projectile did not register a deterministic enemy kill');
  }

  await page.evaluate(() => {
    const save = {
      version: 3,
      state: { time: 0, kills: 12, items: 0, totalKills: 12, totalItems: 0, automap: false },
      player: {
        x: 2.5, y: 2.5, a: 0, hp: 100, armor: 0, armorType: 0,
        ammo: { bullets: 80, shells: 20, rockets: 2, cells: 100 },
        owned: { fist: true, pistol: true, shotgun: true, chaingun: true, rocket: true, plasma: true, bfg: true, chainsaw: true },
        ready: 'chaingun', pending: null, weaponState: 'ready', weaponTimer: 0, attackTimer: 0
      },
      doors: [], explored: ['2,2'], enemies: [], pickups: []
    };
    localStorage.setItem('xlfr4n-microdoom-save-v2', JSON.stringify(save));
  });
  await page.keyboard.press('F3');
  await page.waitForTimeout(240);
  await page.keyboard.down('Space');
  await page.waitForTimeout(500);
  await page.keyboard.up('Space');
  await page.keyboard.press('F2');
  const autoFireState = await page.evaluate(() => JSON.parse(localStorage.getItem('xlfr4n-microdoom-save-v2')));
  if (autoFireState.player.ammo.bullets >= 80) {
    throw new Error('Chaingun did not auto-fire while holding Space');
  }

  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  await browser.close();
  console.log('MICRODOOM browser smoke: PASS');
} finally {
  server.kill('SIGTERM');
}