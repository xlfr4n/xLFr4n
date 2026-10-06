import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('play/index.html', 'utf8');
const js = fs.readFileSync('play/microdoom.js', 'utf8');

assert.match(html, /<canvas[^>]+id="game"[^>]+width="320"[^>]+height="200"/);
assert.match(html, /<script[^>]+src="\.\/microdoom\.js"/);
assert.doesNotMatch(html, /<script[^>]+src="\.\/microdoom\.js"><\/script><script>/);

const mapBlock = js.match(/const MAP = \[(.*?)\n  \];/s)?.[1] ?? '';
const rows = [...mapBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
assert.equal(rows.length, 22, 'MICRODOOM map must have 22 rows');
assert.ok(rows.every((row) => row.length === 31), 'every map row must be 31 cells');
assert.equal(rows.flatMap((row,y) => [...row].map((c,x) => c === 'D' ? [x,y] : null).filter(Boolean)).length, 1);
assert.equal(rows.flatMap((row,y) => [...row].map((c,x) => c === 'B' ? [x,y] : null).filter(Boolean)).length, 1);

for (const token of [
  'fist:', 'pistol:', 'shotgun:', 'chaingun:',
  'spawnEnemy("zombieman"', 'spawnEnemy("imp"', 'spawnEnemy("demon"', 'spawnEnemy("cacodemon"',
  'function useDoor', 'function saveGame', 'function loadGame', 'requestPointerLock',
  'lineOfSight', 'updateProjectiles', 'drawAutomap'
]) assert.ok(js.includes(token), 'missing gameplay token: ' + token);

console.log('MICRODOOM static smoke: PASS');
const directions = [[1,0],[-1,0],[0,1],[0,-1]];
const reachable = (openD, openB) => {
  const queue = [[2,2]];
  const seen = new Set(["2,2"]);
  for (let i = 0; i < queue.length; i++) {
    const [x,y] = queue[i];
    for (const [dx,dy] of directions) {
      const nx=x+dx, ny=y+dy;
      if (ny<0 || ny>=rows.length || nx<0 || nx>=31) continue;
      const cell=rows[ny][nx];
      if (!(cell==="." || (cell==="D" && openD) || (cell==="B" && openB))) continue;
      const k=nx+","+ny;
      if (!seen.has(k)) { seen.add(k); queue.push([nx,ny]); }
    }
  }
  return seen;
};
assert.ok(reachable(true,false).has("16,9"), "blue key must be reachable after the normal door");
assert.equal(reachable(true,false).has("27,10"), false, "exit must remain locked before blue door");
assert.ok(reachable(true,true).has("27,10"), "exit must be reachable after blue door");
assert.ok(js.includes('pistol: { name: "PISTOL"') && js.includes('auto: false'), "pistol must be single-shot");
assert.ok(js.includes('chaingun: { name: "CHAINGUN"') && js.includes('auto: true'), "chaingun must support auto-fire");

assert.ok(js.includes("const SIM_DT = 1 / 35;"), "simulation should run at a fixed 35Hz tick");
assert.ok(js.includes("while(accumulator>=SIM_DT"), "render loop must decouple rendering from simulation tick");

for (const token of [
  'rocket:', 'plasma:', 'bfg:', 'chainsaw:',
  'rocketlauncher', 'rockets', 'plasmagun', 'cellpack', 'chainsaw', 'bfg',
  'function weaponHasAmmo', 'version:3'
]) assert.ok(js.includes(token), 'missing expanded gameplay token: ' + token);

assert.ok(js.includes('function completeLevel()'), 'explicit exit completion must exist');
assert.ok(js.includes('EXIT READY · PRESS E'), 'exit must advertise explicit interaction');
assert.ok(js.includes('const atExit='), 'exit interaction proximity must be checked');

for (const token of ['shotguy:', 'baron:', 'type:e.type==="baron"?"baronball":"fireball"', 'e.code==="Space"']) {
  assert.ok(js.includes(token), 'missing combat/AI token: ' + token);
}
assert.ok(js.includes('!e.repeat&&state.mode==="playing"'), 'discrete actions must ignore key auto-repeat');

for (const token of ['armorType', 'function hitEnemy', 'painChance', 'megaarmor', 'Math.floor(amount/3)', 'Math.floor(amount/2)']) {
  assert.ok(js.includes(token), 'missing combat-state token: ' + token);
}

assert.ok(js.includes('weaponState: "ready"'), "player must have an explicit weapon state");
assert.ok(js.includes('player.weaponState = "lowering"'), "weapon switch must lower");
assert.ok(/weaponState\s*=\s*"raising"/.test(js), "weapon switch must raise");
assert.ok(js.includes('player.weaponState !== "ready"'), "shooting must be blocked during weapon animation");
assert.ok(/switchOffset\s*=\s*24\s*\*\s*\(1-player\.weaponTimer\/0\.09\)/.test(js), "weapon must visually lower");
assert.ok(/switchOffset\s*=\s*24\s*\*\s*\(player\.weaponTimer\/0\.11\)/.test(js), "weapon must visually raise");
assert.ok(js.includes('player.pending = name;') && js.includes('player.weaponState = "lowering";'), "weapon requests must enter the lowering state");
assert.ok(js.includes('selectWeapon("shotgun")') && js.includes('selectWeapon("chaingun")') && js.includes('selectWeapon("rocket")'), "weapon pickups must use the weapon switch state machine");
assert.ok(js.includes('p.type==="megaarmor"') && js.includes('player.armorType=2'), "blue armor must grant mega-armor state");
assert.match(js,/p\.type==="armor"[\s\S]{0,220}player\.armorType=1/, "green armor must enable its damage-absorption type");
assert.ok(js.includes("player.owned[w] && weaponHasAmmo(w)"), "weapon cycling must skip weapons without enough ammo");
assert.ok(js.includes('if (!other.alive || other === p.owner) continue;'), "projectiles must collide with valid enemy targets");
assert.doesNotMatch(js, /other === p\.owner \|\| p\.owner === player/, "player projectiles must not be globally excluded from enemy collision");
assert.ok(js.includes('vis.push({type:"pickup"') && js.includes('vis.push({type:"projectile"') && js.includes('vis.push({type:"exit"'), "world render must include pickups, projectiles and exit");
assert.ok(js.includes('function drawExit'), "exit must have a visible world representation");
assert.ok(js.includes('return Math.hypot(player.x-x,player.y-y) >= r + .16;'), "enemy movement must respect player collision radius");
assert.ok(js.includes('Math.ceil(travel / 0.09)'), "fast projectiles must use collision substeps");
assert.doesNotMatch(js, /if \(p\.owner === player && Math\.hypot\(p\.x-player\.x,p\.y-player\.y\) < \.20\)/, "player projectiles must not self-collide while leaving the weapon");
assert.ok(html.includes('id="game-ui"') && html.includes('data-action="start"') && html.includes('data-action="exit"'), "Microdoom must expose a real in-game menu with start/exit actions");
assert.ok(html.includes('id="setting-sensitivity"') && html.includes('id="setting-volume"'), "Microdoom must expose persistent control/audio options");
assert.ok(js.includes('SETTINGS_KEY') && js.includes('DEFAULT_SETTINGS') && js.includes('settings.mouseSensitivity'), "Microdoom must persist mouse sensitivity settings");
assert.ok(js.includes('DEFAULT_SETTINGS') && js.includes('mouseSensitivity: 0.00075'), "responsive mouse sensitivity default must be conservative");
assert.ok(/mouseLookDelta\*settings\.mouseSensitivity/.test(js), "mouse look must use configurable sensitivity");
assert.ok(js.includes('unadjustedMovement:true'), "pointer lock must request raw mouse movement");
assert.ok(js.includes('"onpointerrawupdate" in window') && js.includes('pointerrawupdate'), "raw pointer input should be preferred when supported");
assert.ok(js.includes('mouseLookDelta=clamp(mouseLookDelta+e.movementX,-1200,1200)'), "mouse deltas must be accumulated safely");
assert.ok(js.includes('player.a=wrapAngle(player.a+mouseLookDelta*settings.mouseSensitivity)'), "mouse look must be applied on the visual frame");
assert.ok(js.includes('mouseLookDelta=0'), "consumed mouse input must be cleared each frame");
assert.ok(js.includes('function pauseGame()') && js.includes('function resumeGame()') && js.includes('function returnToTitle()'), "menu navigation actions must be explicit");
assert.ok(js.includes('window.location.href = "../"'), "exit action must return to the lab");

assert.ok(js.includes('if(keys.MouseLeft||keys.Space)'), "automatic weapons must fire while held through mouse or space");
assert.ok(js.includes('if(e.code==="KeyP"&&!e.repeat&&state.mode==="playing")'), "pause toggle must remain discrete");


assert.ok(js.includes('version:3'), "save format must use the current version");
assert.ok(js.includes('armorType:player.armorType') && js.includes('explored:[...explored]') && js.includes('automap:state.automap'), "save data must preserve gameplay state");

