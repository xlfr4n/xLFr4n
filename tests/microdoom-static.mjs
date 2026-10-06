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
