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