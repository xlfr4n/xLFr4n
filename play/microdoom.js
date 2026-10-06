/* ⚡ xLFr4n // MICRODOOM // original browser engine */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = canvas.width;
  const H = canvas.height;
  const VIEW_H = 160;
  const FOV = Math.PI / 3;
  const TAU = Math.PI * 2;
  const MAX_DT = 0.05;
  const SIM_DT = 1 / 35;
  const SAVE_KEY = "xlfr4n-microdoom-save-v2";

  ctx.imageSmoothingEnabled = false;

  const MAP = [
    "###############################",
    "#.........#.........#.........#",
    "#.........#.........#.........#",
    "#.........#.........#.........#",
    "#.........D.........#.........#",
    "#.........#.........#.........#",
    "#.........#.........#.........#",
    "#.........#.........#.........#",
    "#.........#.........#.........#",
    "#.........#.........B.........#",
    "#.........#.........#.........#",
    "######.########################",
    "#.........#.............#.....#",
    "#.........#.............#.....#",
    "#.........#.............#.....#",
    "#.........#.............#.....#",
    "#.........#.............#.....#",
    "#.........#.............#.....#",
    "#.........#.............#.....#",
    "#.........#.............#.....#",
    "#.............................#",
    "###############################"
  ];

  const playerSpawn = { x: 2.5, y: 2.5, a: 0 };
  const exit = { x: 27.5, y: 10.5 };

  const WEAPONS = {
    fist: { name: "FIST", ammo: null, damage: [2, 20], cooldown: 0.42, range: 1.0, pellets: 1, spread: 0, auto: false },
    pistol: { name: "PISTOL", ammo: "bullets", damage: [3, 12], cooldown: 0.18, range: 18, pellets: 1, spread: 0.018, auto: false },
    shotgun: { name: "SHOTGUN", ammo: "shells", damage: [3, 12], cooldown: 0.82, range: 16, pellets: 7, spread: 0.085, auto: false },
    chaingun: { name: "CHAINGUN", ammo: "bullets", damage: [3, 12], cooldown: 0.10, range: 18, pellets: 1, spread: 0.035, auto: true },
    rocket: { name: "ROCKET LAUNCHER", ammo: "rockets", damage: [20, 160], cooldown: 0.82, range: 24, pellets: 1, spread: 0, auto: false },
    plasma: { name: "PLASMA RIFLE", ammo: "cells", damage: [5, 40], cooldown: 0.08, range: 24, pellets: 1, spread: 0.012, auto: true },
    bfg: { name: "BFG9000", ammo: "cells", damage: [50, 200], cooldown: 1.10, range: 24, pellets: 1, spread: 0, auto: false },
    chainsaw: { name: "CHAINSAW", ammo: null, damage: [2, 20], cooldown: 0.09, range: 1.10, pellets: 1, spread: 0, auto: true }
  };

  const ENEMIES = {
    zombieman: { hp: 20, speed: 0.78, radius: 0.23, sight: 11, attackRange: 7, cooldown: 1.30, damage: 8, painChance: 0.22, projectile: false },
    shotguy: { hp: 30, speed: 0.74, radius: 0.24, sight: 11, attackRange: 7, cooldown: 1.45, damage: 6, painChance: 0.22, pellets: 5, spread: 0.13, projectile: false },
    imp: { hp: 60, speed: 0.64, radius: 0.27, sight: 12, attackRange: 8, cooldown: 1.65, damage: 12, painChance: 0.18, projectile: true },
    demon: { hp: 150, speed: 0.96, radius: 0.35, sight: 10, attackRange: 1.0, cooldown: 1.05, damage: 18, painChance: 0.28, projectile: false },
    cacodemon: { hp: 400, speed: 0.50, radius: 0.38, sight: 14, attackRange: 9, cooldown: 2.0, damage: 18, painChance: 0.12, projectile: true },
    baron: { hp: 1000, speed: 0.42, radius: 0.38, sight: 16, attackRange: 9, cooldown: 1.75, damage: 25, painChance: 0.08, projectile: true }
  };;;;

  const state = {
    mode: "title",
    paused: false,
    time: 0,
    kills: 0,
    totalKills: 0,
    items: 0,
    totalItems: 0,
    automap: false,
    damageFlash: 0,
    pickupFlash: 0,
    message: "",
    messageUntil: 0,
    bestTime: Number(localStorage.getItem("xlfr4n-microdoom-best") || "0")
  };

  const player = {
    x: playerSpawn.x, y: playerSpawn.y, a: playerSpawn.a,
    hp: 100, armor: 0, armorType: 0,
    ammo: { bullets: 70, shells: 8, rockets: 0, cells: 0 },
    owned: { fist: true, pistol: true, shotgun: false, chaingun: false, rocket: false, plasma: false, bfg: false, chainsaw: false },
    ready: "pistol", pending: null,
    weaponTimer: 0, attackTimer: 0, muzzle: 0, recoil: 0,
    bob: 0, vx: 0, vy: 0
  };

  const enemies = [];
  const pickups = [];
  const projectiles = [];
  const particles = [];
  const navCache = new Map();
  let soundAlert = 0;
  const doors = new Map();
  const explored = new Set();
  const keys = Object.create(null);
  const zBuffer = new Float32Array(W);
  let last = performance.now();
  let accumulator = 0;
  let audio = null;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function int(a, b) { return Math.floor(rand(a, b + 1)); }
  function wrapAngle(a) { return ((a % TAU) + TAU) % TAU; }
  function angleDiff(a, b) { return ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI; }
  function key(x, y) { return x + "," + y; }

  function tile(tx, ty) {
    if (ty < 0 || ty >= MAP.length || tx < 0 || tx >= MAP[0].length) return "#";
    return MAP[ty][tx];
  }

  function doorOpen(tx, ty) {
    const d = doors.get(key(tx, ty));
    return !!d?.open;
  }

  function walkableCell(tx, ty) {
    const t = tile(tx, ty);
    return t === "." || ((t === "D" || t === "B") && doorOpen(tx, ty));
  }

  function solidAt(x, y) {
    return !walkableCell(Math.floor(x), Math.floor(y));
  }

  function blocked(x, y, radius) {
    const r = radius ?? 0.16;
    const samples = [[-r,-r],[r,-r],[-r,r],[r,r],[0,-r],[0,r],[-r,0],[r,0]];
    return samples.some(([sx, sy]) => solidAt(x + sx, y + sy));
  }

  function tryMove(body, dx, dy, radius) {
    const r = radius ?? 0.16;
    const canOccupy = (x, y) => {
      if (blocked(x, y, r)) return false;
      if (body === player) {
        for (const e of enemies) {
          if (e.alive && Math.hypot(e.x - x, e.y - y) < r + ENEMIES[e.type].radius) return false;
        }
      }
      return true;
    };
    const nx = body.x + dx;
    const ny = body.y + dy;
    if (canOccupy(nx, body.y)) body.x = nx;
    if (canOccupy(body.x, ny)) body.y = ny;
  }

  function lineOfSight(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / 0.10);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (solidAt(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
  }

  function rayCast(sx, sy, angle) {
    const sin = Math.sin(angle), cos = Math.cos(angle);
    let mx = Math.floor(sx), my = Math.floor(sy);
    const ddx = Math.abs(1 / (cos || 1e-9));
    const ddy = Math.abs(1 / (sin || 1e-9));
    const stepx = cos < 0 ? -1 : 1, stepy = sin < 0 ? -1 : 1;
    let sxide = cos < 0 ? (sx - mx) * ddx : (mx + 1 - sx) * ddx;
    let syide = sin < 0 ? (sy - my) * ddy : (my + 1 - sy) * ddy;
    let side = 0, dist = 24;
    for (let i = 0; i < 96; i++) {
      if (sxide < syide) { sxide += ddx; mx += stepx; side = 0; dist = sxide - ddx; }
      else { syide += ddy; my += stepy; side = 1; dist = syide - ddy; }
      const t = tile(mx, my);
      if (t === "#" || ((t === "D" || t === "B") && !doorOpen(mx, my))) break;
    }
    dist = clamp(dist, 0.001, 24);
    let wallPos = side === 0 ? sy + dist * sin : sx + dist * cos;
    wallPos -= Math.floor(wallPos);
    return { dist, side, mx, my, wallPos };
  }

  function findFloorNear(x, y) {
    if (!solidAt(x, y)) return { x, y };
    for (let r = 1; r < 8; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          const nx = Math.floor(x) + ox + 0.5;
          const ny = Math.floor(y) + oy + 0.5;
          if (!solidAt(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return { x: 2.5, y: 1.5 };
  }

  function navKey(x, y) { return x + "," + y; }

  function nextPathCell(sx, sy, tx, ty) {
    const start = Math.floor(sx) + "," + Math.floor(sy);
    const goal = Math.floor(tx) + "," + Math.floor(ty);
    if (start === goal) return null;
    const queue = [[Math.floor(sx), Math.floor(sy)]];
    const prev = new Map([[start, null]]);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    while (queue.length) {
      const [x,y] = queue.shift();
      const here = navKey(x,y);
      if (here === goal) break;
      for (const [dx,dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || ny >= MAP.length || nx >= MAP[0].length) continue;
        const t = tile(nx,ny);
        if (!(t === "." || ((t === "D" || t === "B") && doorOpen(nx,ny)))) continue;
        const k = navKey(nx,ny);
        if (prev.has(k)) continue;
        prev.set(k, here);
        queue.push([nx,ny]);
      }
    }
    if (!prev.has(goal)) return null;
    let cur = goal;
    let parent = prev.get(cur);
    while (parent && parent !== start) {
      cur = parent;
      parent = prev.get(cur);
    }
    const [px,py] = cur.split(",").map(Number);
    return { x: px + 0.5, y: py + 0.5 };
  }

  function wakeNearbyEnemies(radius = 12) {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - player.x, e.y - player.y) <= radius) {
        e.target = player;
        e.state = "chase";
      }
    }
  }

  function spawnEnemy(type, x, y) {
    const p = findFloorNear(x, y);
    const d = ENEMIES[type];
    enemies.push({
      type, x: p.x, y: p.y, hp: d.hp, maxHp: d.hp, alive: true,
      cd: rand(0.4, d.cooldown), pain: 0, state: "idle",
      angle: 0, phase: rand(0, TAU), strafe: Math.random() < 0.5 ? -1 : 1,
      target: player, pathTimer: 0, path: [], dead:false, deathTimer:0
    });
  }

  function targetAlive(target) {
    return target === player ? state.mode === "playing" : !!target?.alive;
  }

  function targetPosition(enemy) {
    const target = targetAlive(enemy.target) ? enemy.target : player;
    return { target, x: target.x, y: target.y };
  }

  function spawnPickup(type, x, y, value) {
    const p = findFloorNear(x, y);
    pickups.push({ type, x: p.x, y: p.y, value: value ?? 1, taken: false, phase: rand(0, TAU) });
  }

  function setupLevel() {
    enemies.length = 0; pickups.length = 0; projectiles.length = 0; particles.length = 0;
    doors.clear(); explored.clear();
    for (let y = 0; y < MAP.length; y++) {
      for (let x = 0; x < MAP[y].length; x++) {
        if (MAP[y][x] === "D" || MAP[y][x] === "B") doors.set(key(x, y), { open: false, locked: MAP[y][x] === "B" });
      }
    }

    spawnEnemy("zombieman", 6.5, 5.5);
    spawnEnemy("shotguy", 10.5, 7.5);
    spawnEnemy("imp", 14.5, 3.5);
    spawnEnemy("zombieman", 24.5, 4.5);
    spawnEnemy("demon", 6.5, 9.5);
    spawnEnemy("imp", 25.5, 9.5);
    spawnEnemy("zombieman", 15.5, 9.5);
    spawnEnemy("demon", 7.5, 15.5);
    spawnEnemy("imp", 8.5, 18.5);
    spawnEnemy("cacodemon", 23.5, 7.5);
    spawnEnemy("baron", 26.5, 8.5);
    spawnEnemy("zombieman", 27.5, 6.5);

    spawnPickup("clip", 4.5, 3.5, 10);
    spawnPickup("shells", 13.5, 3.5, 4);
    spawnPickup("stim", 8.5, 7.5, 10);
    spawnPickup("armor", 25.5, 4.5, 100);
    spawnPickup("shotgun", 4.5, 9.5, 1);
    spawnPickup("clipbox", 14.5, 7.5, 20);
    spawnPickup("medkit", 5.5, 14.5, 25);
    spawnPickup("shellbox", 8.5, 14.5, 8);
    spawnPickup("keyblue", 16.5, 9.5, 1);
    spawnPickup("chaingun", 18.5, 10.5, 1);
    spawnPickup("rocketlauncher", 14.5, 14.5, 1);
    spawnPickup("rockets", 18.5, 14.5, 2);
    spawnPickup("chainsaw", 4.5, 17.5, 1);
    spawnPickup("plasmagun", 24.5, 14.5, 1);
    spawnPickup("cellpack", 25.5, 18.5, 10);
    spawnPickup("megaarmor", 27.5, 17.5, 200);
    spawnPickup("soulsphere", 27.5, 8.5, 100);
    spawnPickup("bfg", 22.5, 20.5, 1);

    state.kills = 0;
    state.totalKills = enemies.length;
    state.items = 0;
    state.totalItems = pickups.length;
    explored.add(key(Math.floor(player.x), Math.floor(player.y)));
  }

  function resetPlayer() {
    Object.assign(player, {
      x: playerSpawn.x, y: playerSpawn.y, a: playerSpawn.a,
      hp: 100, armor: 0, armorType: 0,
      ammo: { bullets: 70, shells: 8, rockets: 0, cells: 0 },
      owned: { fist: true, pistol: true, shotgun: false, chaingun: false, rocket: false, plasma: false, bfg: false, chainsaw: false },
      ready: "pistol", pending: null, weaponState: "ready", weaponTimer: 0, attackTimer: 0,
      muzzle: 0, recoil: 0, bob: 0, vx: 0, vy: 0
    });
  }

  function newGame() {
    resetPlayer();
    setupLevel();
    state.mode = "playing";
    state.paused = false;
    state.time = 0;
    state.damageFlash = 0;
    state.pickupFlash = 0;
    toast("FIND THE BLUE KEYCARD · CLEAR THE SECTOR · REACH THE EXIT", 4);
    beep("start");
  }

  function toast(msg, seconds) {
    state.message = msg;
    state.messageUntil = performance.now() + (seconds || 2) * 1000;
  }

  function initAudio() {
    if (!audio) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) audio = new C();
    }
    if (audio?.state === "suspended") audio.resume().catch(() => {});
  }

  function beep(kind) {
    if (!audio) return;
    const p = {
      start:[80,160,.13,"sawtooth",.025],
      pistol:[180,65,.07,"square",.04],
      shotgun:[92,28,.17,"sawtooth",.065],
      chaingun:[220,100,.045,"square",.03],
      rocket:[90,25,.22,"sawtooth",.06],
      plasma:[340,90,.07,"square",.035],
      bfg:[180,35,.40,"sawtooth",.08],
      punch:[125,45,.09,"triangle",.045],
      chainsaw:[140,75,.10,"sawtooth",.045],
      pickup:[480,920,.11,"square",.025],
      key:[280,760,.26,"triangle",.03],
      hurt:[65,30,.14,"sawtooth",.05],
      door:[170,75,.28,"sawtooth",.018],
      monster:[82,45,.14,"triangle",.025],
      death:[105,34,.45,"sawtooth",.05]
    }[kind] || [160,80,.08,"square",.03];
    const now = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = p[3]; o.frequency.setValueAtTime(p[0], now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20,p[1]), now + p[2]);
    g.gain.setValueAtTime(p[4], now); g.gain.exponentialRampToValueAtTime(.0001, now + p[2]);
    o.connect(g); g.connect(audio.destination); o.start(now); o.stop(now + p[2] + .01);
  }

  function hurt(amount) {
    if(state.mode!=="playing")return;
    let saved=0;
    if(player.armorType===1)saved=Math.floor(amount/3);
    else if(player.armorType===2)saved=Math.floor(amount/2);
    if(saved>player.armor)saved=player.armor;
    player.armor-=saved;
    if(player.armor<=0)player.armorType=0;
    const dealt=amount-saved;
    player.hp-=dealt;
    state.damageFlash=.18;
    beep("hurt");
    if(player.hp<=0){
      player.hp=0;
      state.mode="dead";
      document.exitPointerLock?.();
      beep("death");
    }
  }


  function hasKeycard() {
    return pickups.some(p => p.type === "keyblue" && p.taken);
  }

  function completeLevel() {
    state.mode="won";
    if(!state.bestTime || state.time<state.bestTime){
      state.bestTime=state.time;
      localStorage.setItem("xlfr4n-microdoom-best",String(state.time));
    }
    document.exitPointerLock?.();
    beep("key");
  }

  function useDoor() {
    const nearExit=Math.hypot(player.x-exit.x,player.y-exit.y)<.95;
    if(nearExit){
      if(!hasKeycard()){
        toast("BLUE KEYCARD REQUIRED",1.4);
        beep("door");
        return;
      }
      if(state.kills<state.totalKills){
        toast("SECTOR NOT CLEAR",1.4);
        return;
      }
      toast("EXITING SECTOR",.8);
      completeLevel();
      return;
    }

    const fx=player.x+Math.cos(player.a)*1.15;
    const fy=player.y+Math.sin(player.a)*1.15;
    const tx=Math.floor(fx),ty=Math.floor(fy),t=tile(tx,ty);
    if(t!=="D"&&t!=="B"){
      toast("NOTHING TO USE",1.0);
      return;
    }
    const d=doors.get(key(tx,ty));
    if(d.locked&&!hasKeycard()){
      toast("BLUE KEYCARD REQUIRED",1.5);
      beep("door");
      return;
    }
    if(d.open){
      const cx=tx+.5,cy=ty+.5;
      const blockedByPlayer=Math.hypot(player.x-cx,player.y-cy)<.68;
      const blockedByEnemy=enemies.some(e=>e.alive&&Math.hypot(e.x-cx,e.y-cy)<ENEMIES[e.type].radius+.20);
      if(blockedByPlayer||blockedByEnemy){
        toast("DOOR BLOCKED",1.0);
        beep("door");
        return;
      }
    }
    d.open=!d.open;
    toast(d.open?"DOOR OPEN":"DOOR CLOSED",1.0);
    beep("door");
  }


  function weaponHasAmmo(name) {
    const w=WEAPONS[name];
    if(!w?.ammo)return true;
    return player.ammo[w.ammo] >= (name==="bfg" ? 40 : 1);
  }

  function selectWeapon(name) {
    if (!player.owned[name] || !weaponHasAmmo(name)) return;
    if (player.ready === name && player.weaponState === "ready") return;

    // Queue the latest request so fast weapon presses remain deterministic.
    player.pending = name;
    if (player.weaponState === "ready") {
      player.weaponState = "lowering";
      player.weaponTimer = 0.09;
    }
  }

  function nextWeapon() {
    const order = ["fist", "pistol", "shotgun", "chaingun", "rocket", "plasma", "bfg", "chainsaw"];
    const i = order.indexOf(player.ready);
    for (let n = 1; n <= order.length; n++) {
      const w = order[(i + n) % order.length];
      if (player.owned[w] && weaponHasAmmo(w)) { selectWeapon(w); return; }
    }
  }

  function chooseFallback() {
    if (player.owned.plasma && player.ammo.cells >= 1) return "plasma";
    if (player.owned.chaingun && player.ammo.bullets) return "chaingun";
    if (player.owned.rocket && player.ammo.rockets) return "rocket";
    if (player.owned.shotgun && player.ammo.shells) return "shotgun";
    if (player.ammo.bullets) return "pistol";
    return player.owned.chainsaw ? "chainsaw" : "fist";
  }

  function visibleTarget(angle, range, cone) {
    let best = null, bestD = range;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.x - player.x, dy = e.y - player.y, d = Math.hypot(dx, dy);
      if (d >= bestD || Math.abs(angleDiff(Math.atan2(dy, dx), angle)) > cone) continue;
      if (!lineOfSight(player.x, player.y, e.x, e.y)) continue;
      best = e; bestD = d;
    }
    return best;
  }

  function impact(x, y, rgb, count) {
    for (let i = 0; i < (count || 4); i++) {
      particles.push({ x, y, vx: rand(-1,1), vy: rand(-1,1), life: rand(.08,.25), max:.25, rgb });
    }
  }

  function hitEnemy(e,damage,source=player) {
    if(!e?.alive)return;
    e.hp-=damage;
    if(Math.random()<ENEMIES[e.type].painChance)e.pain=.12;
    if(source&&source!==e)e.target=source;
    e.state="chase";
    if(e.hp<=0)killEnemy(e);
  }

  function killEnemy(e) {
    if (!e.alive) return;
    e.alive=false;
    e.state="dead";
    e.dead=true;
    e.deathTimer=0;
    state.kills++;
    impact(e.x,e.y,e.type==="cacodemon"?"230,75,55":"205,65,40",10);
  }


  function shoot() {
    if (state.mode !== "playing" || state.paused || player.weaponState !== "ready" || player.attackTimer > 0) return;
    const name = player.ready;
    const w = WEAPONS[name];
    const cost = name === "bfg" ? 40 : (w.ammo ? 1 : 0);

    if (w.ammo && player.ammo[w.ammo] < cost) {
      const fallback = chooseFallback();
      if (fallback !== name) selectWeapon(fallback);
      toast("NO AMMO", 1.0);
      return;
    }

    if (w.ammo) player.ammo[w.ammo] -= cost;
    player.attackTimer = w.cooldown;
    player.muzzle = name === "chainsaw" ? .04 : .07;
    player.recoil = name === "shotgun" ? 5 : name === "rocket" ? 3 : name === "bfg" ? 7 : 2;
    soundAlert = 1.0;
    wakeNearbyEnemies();

    if (name === "fist" || name === "chainsaw") {
      const e = visibleTarget(player.a, w.range, name === "chainsaw" ? .24 : .16);
      if (e) {
        hitEnemy(e,int(w.damage[0],w.damage[1]),player);
        impact(e.x, e.y, "255,210,170", name === "chainsaw" ? 1 : 3);
      }
      beep(name === "chainsaw" ? "chainsaw" : "punch");
      return;
    }

    if (name === "rocket") {
      projectiles.push({
        x: player.x, y: player.y, a: player.a,
        speed: 7.0, damage: int(w.damage[0], w.damage[1]), life: 4,
        owner: player, type: "rocket"
      });
      beep("rocket");
      return;
    }

    if (name === "plasma") {
      projectiles.push({
        x: player.x, y: player.y, a: player.a + rand(-w.spread, w.spread),
        speed: 15, damage: int(w.damage[0], w.damage[1]), life: 2,
        owner: player, type: "plasma"
      });
      beep("plasma");
      return;
    }

    if (name === "bfg") {
      projectiles.push({
        x: player.x, y: player.y, a: player.a,
        speed: 5.2, damage: int(w.damage[0], w.damage[1]), life: 5,
        owner: player, type: "bfg"
      });
      beep("bfg");
      return;
    }

    for (let i = 0; i < w.pellets; i++) {
      const a = player.a + rand(-w.spread, w.spread);
      const wall = rayCast(player.x, player.y, a);
      const e = visibleTarget(a, w.range, .10 + w.spread);
      if (e) {
        const d = Math.hypot(e.x-player.x, e.y-player.y);
        if (d < wall.dist + .05) {
          hitEnemy(e,int(w.damage[0],w.damage[1]),player);
          impact(e.x, e.y, "255,210,170", 1);
        }
      } else {
        impact(player.x+Math.cos(a)*wall.dist, player.y+Math.sin(a)*wall.dist, "180,180,180", 1);
      }
    }
    beep(name);
  }
  function enemyAttack(e) {
    const d=ENEMIES[e.type];
    const t=targetPosition(e);
    const a=Math.atan2(t.y-e.y,t.x-e.x);

    if(d.projectile){
      projectiles.push({
        x:e.x,y:e.y,a,
        speed:e.type==="cacodemon"?2.6:e.type==="baron"?3.2:4.1,
        damage:d.damage,life:5,owner:e,
        type:e.type==="baron"?"baronball":"fireball"
      });
    }else if(d.pellets){
      for(let i=0;i<d.pellets;i++){
        const sa=a+rand(-d.spread,d.spread);
        const wall=rayCast(e.x,e.y,sa);
        const dist=Math.hypot(t.x-e.x,t.y-e.y);
        if(wall.dist>=dist-.05&&Math.random()<.72){
          const amount=int(3,d.damage);
          if(t===player)hurt(amount);else{
            t.hp-=amount;t.pain=.10;t.target=e;t.state="chase";
            if(t.hp<=0)killEnemy(t);
          }
        }
      }
    }else{
      const wall=rayCast(e.x,e.y,a);
      const dist=Math.hypot(t.x-e.x,t.y-e.y);
      if(wall.dist>=dist-.05&&Math.random()<.72){
        if(t===player)hurt(d.damage);else{
          t.hp-=d.damage;t.pain=.12;t.target=e;t.state="chase";
          if(t.hp<=0)killEnemy(t);
        }
      }
    }
    e.cd=d.cooldown;e.attackFlash=.1;beep("monster");
  }
  function moveEnemy(e, dx, dy) {
    const r = ENEMIES[e.type].radius;
    const canOccupy = (x,y) => {
      if (blocked(x,y,r) || enemyOverlap(e,x,y)) return false;
      return Math.hypot(player.x-x,player.y-y) >= r + .16;
    };
    const nx=e.x+dx, ny=e.y+dy;
    if (canOccupy(nx,e.y)) e.x=nx;
    if (canOccupy(e.x,ny)) e.y=ny;
  }

  function enemyOverlap(me,x,y) {
    return enemies.some(e => e !== me && e.alive && Math.hypot(e.x-x,e.y-y) < .40);
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.alive) {
        if (e.dead) e.deathTimer = Math.min(1, e.deathTimer + dt);
        continue;
      }
      const d=ENEMIES[e.type];
      e.cd-=dt;
      e.pain=Math.max(0,e.pain-dt);
      e.attackFlash=Math.max(0,(e.attackFlash||0)-dt);
      if (e.pain > 0) continue;
      e.pathTimer -= dt;

      if (!targetAlive(e.target)) e.target = player;
      const t = targetPosition(e);
      const dx=t.x-e.x, dy=t.y-e.y, dist=Math.hypot(dx,dy);
      const sees=lineOfSight(e.x,e.y,t.x,t.y);
      e.angle=Math.atan2(dy,dx);

      if (e.target === player && soundAlert > 0 && dist < d.sight * 1.4 && sees) {
        e.state="chase";
      } else if (e.target === player && sees && dist < d.sight) {
        e.state="chase";
      } else if (e.target !== player && !targetAlive(e.target)) {
        e.target=player;
      }

      if (dist <= d.attackRange && sees) {
        if (e.cd <= 0) enemyAttack(e);
        continue;
      }

      if ((sees && dist < d.sight) || e.state === "chase") {
        e.state="chase";
        let dir=null;
        if(e.pathTimer<=0||!e.path){
          e.path=nextPathCell(e.x,e.y,t.x,t.y);
          e.pathTimer=.28+Math.random()*.12;
        }
        if(e.path){
          const px=e.path.x-e.x,py=e.path.y-e.y,pd=Math.hypot(px,py);
          if(pd>.08)dir={x:px/pd,y:py/pd};
        }
        if(!dir){
          const dd=Math.max(dist,.001);
          dir={x:dx/dd,y:dy/dd};
        }
        const orbit=(e.type==="demon"?.04:.12)*e.strafe;
        const sp=d.speed*dt;
        moveEnemy(e,(dir.x-dir.y*orbit)*sp,(dir.y+dir.x*orbit)*sp);
      } else {
        e.state="idle";
        e.phase += dt;
        const sp=d.speed*.10*dt;
        moveEnemy(e,Math.cos(e.phase)*sp,Math.sin(e.phase)*sp);
      }
    }
  }

  function explode(x, y, damage, radius, source) {
    impact(x, y, "255,130,60", 14);
    const entities = [
      { obj: player, d: Math.hypot(player.x-x, player.y-y), isPlayer: true },
      ...enemies.filter(e => e.alive).map(e => ({ obj:e, d:Math.hypot(e.x-x,e.y-y), isPlayer:false }))
    ];
    for (const item of entities) {
      if (item.d > radius) continue;
      if (!lineOfSight(x,y,item.obj.x,item.obj.y)) continue;
      const scale = 1 - item.d / radius;
      const amount = Math.max(1, Math.round(damage * scale));
      if (item.isPlayer) {
        if (source !== player) hurt(amount);
        else hurt(Math.round(amount * 0.65));
      } else {
        item.obj.hp -= amount;
        item.obj.pain = .12;
        if (source && source !== item.obj) item.obj.target = source;
        item.obj.state = "chase";
        if (item.obj.hp <= 0) killEnemy(item.obj);
      }
    }
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      p.life -= dt;
      if (p.life <= 0) continue;

      // Substep fast projectiles so they cannot tunnel through thin enemies.
      const travel = p.speed * dt;
      const substeps = Math.max(1, Math.ceil(travel / 0.09));
      const step = travel / substeps;
      let consumed = false;

      for (let stepIndex = 0; stepIndex < substeps && !consumed && p.life > 0; stepIndex++) {
        const nx = p.x + Math.cos(p.a) * step;
        const ny = p.y + Math.sin(p.a) * step;

        if (blocked(nx, ny, .07)) {
          if (p.type === "rocket" || p.type === "bfg") explode(p.x,p.y,p.damage,p.type==="bfg"?4.5:2.2,p.owner);
          else impact(p.x,p.y,"120,190,255",4);
          p.life=0;
          consumed=true;
          break;
        }

        p.x=nx; p.y=ny;

        if (p.owner !== player && Math.hypot(p.x-player.x,p.y-player.y) < .22) {
          p.life=0;
          hurt(p.damage);
          impact(p.x,p.y,"255,120,50",7);
          consumed=true;
          break;
        }

        for (const other of enemies) {
          if (!other.alive || other === p.owner) continue;
          if (Math.hypot(p.x-other.x,p.y-other.y) >= ENEMIES[other.type].radius*.75) continue;
          if (p.type === "rocket" || p.type === "bfg") explode(p.x,p.y,p.damage,p.type==="bfg"?4.5:2.2,p.owner);
          else {
            hitEnemy(other,p.damage,p.owner);
            impact(other.x,other.y,"255,150,90",5);
          }
          p.life=0;
          consumed=true;
          break;
        }
      }
    }
    for(let i=projectiles.length-1;i>=0;i--)if(projectiles[i].life<=0)projectiles.splice(i,1);
  }
  function updateParticles(dt) {
    for (const p of particles) { p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.92; p.vy*=.92; }
    for(let i=particles.length-1;i>=0;i--) if(particles[i].life<=0) particles.splice(i,1);
  }

  function collect() {
    for (const p of pickups) {
      if (p.taken || Math.hypot(player.x-p.x, player.y-p.y)>.42) continue;
      let take=true;

      if (p.type==="clip" || p.type==="clipbox") {
        if (player.ammo.bullets>=200) take=false;
        else player.ammo.bullets=Math.min(200,player.ammo.bullets+p.value);
      } else if (p.type==="shells" || p.type==="shellbox") {
        if (player.ammo.shells>=50) take=false;
        else player.ammo.shells=Math.min(50,player.ammo.shells+p.value);
      } else if (p.type==="rockets" || p.type==="rocketbox") {
        if (player.ammo.rockets>=50) take=false;
        else player.ammo.rockets=Math.min(50,player.ammo.rockets+p.value);
      } else if (p.type==="cells" || p.type==="cellpack") {
        if (player.ammo.cells>=300) take=false;
        else player.ammo.cells=Math.min(300,player.ammo.cells+p.value);
      } else if (p.type==="stim" || p.type==="medkit") {
        if (player.hp>=100) take=false;
        else player.hp=Math.min(100,player.hp+p.value);
      } else if (p.type==="armor") {
        if (player.armor>=100) take=false;
        else {
          player.armor=Math.min(100,player.armor+p.value);
          player.armorType=1;
        }
      } else if (p.type==="megaarmor") {
        if (player.armor>=200) take=false;
        else {
          player.armor=Math.min(200,player.armor+p.value);
          player.armorType=2;
        }
      } else if (p.type==="soulsphere") {
        if(player.hp>=200)take=false;
        else player.hp=Math.min(200,player.hp+p.value);
      } else if (p.type==="shotgun") {
        player.owned.shotgun=true;
        player.ammo.shells=Math.min(50,player.ammo.shells+4);
        selectWeapon("shotgun");
      } else if (p.type==="chaingun") {
        player.owned.chaingun=true;
        player.ammo.bullets=Math.min(200,player.ammo.bullets+20);
        selectWeapon("chaingun");
      } else if (p.type==="rocketlauncher") {
        player.owned.rocket=true;
        player.ammo.rockets=Math.min(50,player.ammo.rockets+2);
        selectWeapon("rocket");
      } else if (p.type==="plasmagun") {
        player.owned.plasma=true;
        player.ammo.cells=Math.min(300,player.ammo.cells+20);
        selectWeapon("plasma");
      } else if (p.type==="bfg") {
        player.owned.bfg=true;
        player.ammo.cells=Math.min(300,player.ammo.cells+40);
        selectWeapon("bfg");
      } else if (p.type==="chainsaw") {
        player.owned.chainsaw=true;
        selectWeapon("chainsaw");
      } else if (p.type==="keyblue") {
        toast("BLUE KEYCARD ACQUIRED",2);
      }

      if(!take)continue;
      p.taken=true;
      state.items++;
      state.pickupFlash=.16;
      beep(p.type==="keyblue"?"key":"pickup");
    }
  }
  function updateMovement(dt) {
    const forward=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0);
    const strafe=(keys.KeyD?1:0)-(keys.KeyA?1:0);
    const turn=(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0);
    player.a=wrapAngle(player.a+turn*2.7*dt);
    let vx=0,vy=0;
    if(forward){vx+=Math.cos(player.a)*forward;vy+=Math.sin(player.a)*forward;}
    if(strafe){vx+=Math.cos(player.a+Math.PI/2)*strafe;vy+=Math.sin(player.a+Math.PI/2)*strafe;}
    const len=Math.hypot(vx,vy);
    if(len){vx/=len;vy/=len;}
    const max=keys.ShiftLeft||keys.ShiftRight?3.65:2.55;
    const response=Math.min(1,14*dt);
    player.vx += (vx*max-player.vx)*response;
    player.vy += (vy*max-player.vy)*response;
    if(!len){const f=Math.pow(.08,dt);player.vx*=f;player.vy*=f;}
    tryMove(player,player.vx*dt,player.vy*dt,.16);
    player.bob += Math.hypot(player.vx,player.vy)*dt*7.5;
  }

  function update(dt) {
    if(state.mode!=="playing"||state.paused)return;
    state.time += dt;
    soundAlert = Math.max(0, soundAlert - dt);
    state.damageFlash=Math.max(0,state.damageFlash-dt);
    state.pickupFlash=Math.max(0,state.pickupFlash-dt);
    player.attackTimer=Math.max(0,player.attackTimer-dt);
    player.muzzle=Math.max(0,player.muzzle-dt);
    player.recoil=Math.max(0,player.recoil-dt*22);

    if(player.weaponState!=="ready"){
      player.weaponTimer=Math.max(0,player.weaponTimer-dt);
      if(player.weaponTimer===0&&player.weaponState==="lowering"){
        if(player.pending){
          player.ready=player.pending;
          player.pending=null;
          player.weaponState="raising";
          player.weaponTimer=0.11;
        }else{
          player.weaponState="ready";
        }
      }else if(player.weaponTimer===0&&player.weaponState==="raising"){
        if(player.pending && player.pending !== player.ready && player.owned[player.pending] && weaponHasAmmo(player.pending)){
          player.weaponState="lowering";
          player.weaponTimer=0.09;
        }else{
          player.pending=null;
          player.weaponState="ready";
        }
      }
    }

    updateMovement(dt);
    collect();
    updateEnemies(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    explored.add(key(Math.floor(player.x),Math.floor(player.y)));

    const atExit=Math.hypot(player.x-exit.x,player.y-exit.y)<.95;
    if(atExit && state.kills>=state.totalKills && hasKeycard()) {
      toast("EXIT READY · PRESS E",.9);
    }
    if(keys.MouseLeft||keys.Space){
      const w=WEAPONS[player.ready];
      if(w.auto)shoot();
    }
  }

  function wallRGB(tx,ty,side,pos){
    if(tile(tx,ty)==="D"||tile(tx,ty)==="B"){
      const v=55+(Math.floor(pos*12)%2)*12-side*5;
      return [v+38,v+10,v+4];
    }
    const b=70+((tx*13+ty*17)%3)*10-(Math.floor(pos*10)%4===0?15:0)-side*7;
    return [b+25,b+13,Math.max(22,b)];
  }

  function drawWorld(){
    ctx.fillStyle="#18191c";ctx.fillRect(0,0,W,80);
    ctx.fillStyle="#28201e";ctx.fillRect(0,80,W,80);

    for(let i=0;i<W;i++){
      const a=player.a+(i/W-.5)*FOV;
      const r=rayCast(player.x,player.y,a);
      const d=r.dist*Math.cos(angleDiff(a,player.a));
      zBuffer[i]=d;
      const wh=Math.min(178,160/Math.max(.01,d));
      const top=Math.floor((160-wh)/2)+Math.floor(player.recoil);
      const rgb=wallRGB(r.mx,r.my,r.side,r.wallPos);
      const fog=clamp(d/18,0,.84);
      const rr=Math.round(rgb[0]*(1-fog)+18*fog);
      const gg=Math.round(rgb[1]*(1-fog)+18*fog);
      const bb=Math.round(rgb[2]*(1-fog)+18*fog);
      ctx.fillStyle="rgb("+rr+","+gg+","+bb+")";
      ctx.fillRect(i,top,1,wh);
    }

    const vis=[];
    for(const e of enemies){
      if(!(e.alive || (e.dead && e.deathTimer < 1)))continue;
      const dx=e.x-player.x,dy=e.y-player.y,d=Math.hypot(dx,dy),da=angleDiff(Math.atan2(dy,dx),player.a);
      if(Math.abs(da)<FOV*.80&&lineOfSight(player.x,player.y,e.x,e.y))vis.push({type:"enemy",d,da,o:e});
    }
    for(const p of pickups){
      if(p.taken)continue;
      const dx=p.x-player.x,dy=p.y-player.y,d=Math.hypot(dx,dy),da=angleDiff(Math.atan2(dy,dx),player.a);
      if(Math.abs(da)<FOV*.80&&lineOfSight(player.x,player.y,p.x,p.y))vis.push({type:"pickup",d,da,o:p});
    }
    for(const p of projectiles){
      const dx=p.x-player.x,dy=p.y-player.y,d=Math.hypot(dx,dy),da=angleDiff(Math.atan2(dy,dx),player.a);
      if(Math.abs(da)<FOV*.80&&lineOfSight(player.x,player.y,p.x,p.y))vis.push({type:"projectile",d,da,o:p});
    }
    {
      const dx=exit.x-player.x,dy=exit.y-player.y,d=Math.hypot(dx,dy),da=angleDiff(Math.atan2(dy,dx),player.a);
      if(Math.abs(da)<FOV*.80&&lineOfSight(player.x,player.y,exit.x,exit.y))vis.push({type:"exit",d,da,o:exit});
    }
    vis.sort((a,b)=>b.d-a.d);
    for(const s of vis){
      const sx=Math.round(W/2+(s.da/FOV)*W);
      const col=clamp(sx,0,W-1);
      if(zBuffer[col]<s.d*Math.cos(s.da)-.08)continue;
      if(s.type==="enemy")drawEnemy(s.o,sx,s.d);
      else if(s.type==="pickup")drawPickup(s.o,sx,s.d);
      else if(s.type==="exit")drawExit(sx,s.d);
      else drawFireball(sx,s.d,s.o);
    }
    drawParticles();
    drawWeapon();
  }

  function spriteRect(a,b,w,h,color,depth){
    const left=Math.max(0,Math.floor(a)),right=Math.min(W-1,Math.ceil(a+w)-1);
    const d=depth*Math.max(.72,1);
    for(let sx=left;sx<=right;sx++)if(zBuffer[sx]>=d)rect(sx,b,1,h,color);
  }

  function drawEnemy(e,sx,d){
    const dead=e.dead&&!e.alive;
    const fall=dead?Math.min(1,e.deathTimer):0;
    const z=clamp(11/Math.max(.25,d),.25,3);
    const baseW=e.type==="cacodemon"?34:e.type==="baron"?32:e.type==="demon"?28:23;
    const baseH=e.type==="cacodemon"?31:e.type==="baron"?42:e.type==="demon"?38:34;
    const w=Math.max(5,Math.floor(baseW*z));
    const h=Math.max(4,Math.floor(baseH*z*(dead?Math.max(.30,1-fall*.70):1)));
    const left=Math.floor(sx-w/2);
    const top=Math.floor(80-h*.55+fall*h*.25+(dead?0:Math.sin(performance.now()/120+e.phase)*Math.min(2,z)));
    const tint=dead?"#5a3028":"";

    if(e.type==="cacodemon"){
      spriteRect(left,top+h*.18,w,h*.64,dead?"#4e3836":"#73423e",d);
      spriteRect(left+w*.18,top,w*.64,h*.28,dead?"#5f403d":"#98564c",d);
      if(!dead){spriteRect(left+w*.25,top+h*.3,w*.16,h*.12,"#ffe56b",d);spriteRect(left+w*.59,top+h*.3,w*.16,h*.12,"#ffe56b",d);}
    }else if(e.type==="baron"){
      spriteRect(left+w*.12,top+h*.16,w*.76,h*.72,dead?"#394638":"#48634a",d);
      spriteRect(left+w*.19,top,w*.62,h*.42,dead?"#475846":"#5f815f",d);
      if(!dead){spriteRect(left+w*.28,top+h*.25,w*.12,h*.08,"#ffe66b",d);spriteRect(left+w*.60,top+h*.25,w*.12,h*.08,"#ffe66b",d);}
    }else if(e.type==="demon"){
      spriteRect(left+w*.12,top+h*.18,w*.76,h*.70,dead?"#4b201c":"#67251f",d);
      spriteRect(left+w*.18,top,w*.64,h*.48,dead?"#603027":"#92382a",d);
      if(!dead){spriteRect(left+w*.26,top+h*.23,w*.13,h*.10,"#f3c958",d);spriteRect(left+w*.61,top+h*.23,w*.13,h*.10,"#f3c958",d);}
    }else{
      const base=e.type==="imp"?"#883325":"#595b56";
      spriteRect(left+w*.2,top+h*.2,w*.6,h*.62,dead?"#4b4844":base,d);
      spriteRect(left+w*.27,top+h*.06,w*.46,h*.30,dead?"#55514b":e.type==="imp"?"#a6482e":e.type==="shotguy"?"#7a746b":"#6a6d67",d);
      if(!dead){spriteRect(left+w*.31,top+h*.22,w*.1,h*.09,"#ffe76a",d);spriteRect(left+w*.59,top+h*.22,w*.1,h*.09,"#ffe76a",d);}
    }

    if(!dead&&e.pain>0)spriteRect(left,top,w,h,"rgba(255,255,255,.4)",d);
    if(!dead&&e.hp<e.maxHp){
      spriteRect(left,top-3,w,2,"#161616",d);
      spriteRect(left,top-3,Math.max(1,w*clamp(e.hp/e.maxHp,0,1)),2,"#d13b2c",d);
    }
  }


  function pickupColor(t){
    return {
      clip:"#c9bd7b",clipbox:"#a58e55",shells:"#dbc58c",shellbox:"#b08d5a",
      rockets:"#a64b34",rocketbox:"#734333",cells:"#64b6cf",cellpack:"#3d7f91",
      stim:"#52a86a",medkit:"#e7e7e7",armor:"#3f8d94",megaarmor:"#6da8b0",shotgun:"#89633d",
      chaingun:"#707678",rocketlauncher:"#4d4b48",plasmagun:"#477d83",bfg:"#617a68",
      chainsaw:"#7f402d",keyblue:"#4a87ea",soulsphere:"#59aaa3"
    }[t]||"#ddd";
  }
  function drawExit(sx,d){
    const z=clamp(9/Math.max(.25,d),.25,3);
    const w=Math.max(6,Math.floor(10*z));
    const h=Math.max(10,Math.floor(20*z));
    const y=80-h*.5;
    const ready=hasKeycard()&&state.kills>=state.totalKills;
    const c=ready?"#4cc6a0":"#36566a";
    spriteRect(sx-w/2,y,w,h,c,d);
    spriteRect(sx-w*.30,y+h*.18,w*.60,h*.58,ready?"#8fffd2":"#5a7690",d);
    spriteRect(sx-w*.12,y+h*.30,w*.24,h*.38,ready?"#d9fff0":"#91a8b8",d);
    if(ready) spriteRect(sx-w*.42,y-h*.10,w*.84,2,"#d9fff0",d);
  }

  function drawPickup(p,sx,d){
    const z=clamp(7/Math.max(.25,d),.25,3),s=Math.max(4,Math.floor(8*z)),y=Math.floor(80-s+Math.sin(performance.now()/260+p.phase)*2*z),left=sx-s/2;
    spriteRect(left,y,s,s,pickupColor(p.type),d);
    spriteRect(sx-s*.25,y+s*.25,s*.5,s*.5,"#111",d);
    if(p.type==="keyblue")spriteRect(sx-s*.1,y+s*.12,s*.2,s*.72,"#69a8ff",d);
  }


  function drawFireball(sx,d,p){
    const z=clamp(4/Math.max(.25,d),.25,3),r=Math.max(2,Math.floor(4*z)),y=80+Math.sin(performance.now()/80+d)*2;
    const color=p?.type==="baronball"?"#70e98b":p?.type==="plasma"?"#72e8ff":"#e85224";
    const core=p?.type==="baronball"?"#d7ffe0":p?.type==="plasma"?"#d4ffff":"#ffe66a";
    spriteRect(sx-r,y-r,r*2,r*2,color,d);
    spriteRect(sx-r*.4,y-r*.4,r*.8,r*.8,core,d);
  }


  function drawParticles(){
    for(const p of particles){
      const dx=p.x-player.x,dy=p.y-player.y,d=Math.hypot(dx,dy),a=angleDiff(Math.atan2(dy,dx),player.a);
      if(Math.abs(a)>FOV*.8)continue;
      const sx=W/2+(a/FOV)*W;
      if(sx<0||sx>=W)continue;
      const size=clamp(2/Math.max(.3,d),1,5);
      rect(sx-size/2,80-size/2,size,size,"rgba("+p.rgb+","+clamp(p.life/p.max,0,1)+")");
    }
  }

  function drawWeapon() {
    const speed=Math.hypot(player.vx,player.vy);
    const bob=Math.sin(player.bob)*Math.min(2.5,speed*.9);
    let switchOffset=0;
    if(player.weaponState==="lowering") switchOffset=24*(1-player.weaponTimer/0.09);
    else if(player.weaponState==="raising") switchOffset=24*(player.weaponTimer/0.11);
    const y=137+bob+player.recoil+switchOffset,cx=160;
    const ready=player.ready;
    if(ready==="shotgun"){
      rect(cx-13,y,26,24,"#49392d"); rect(cx-6,y-15,4,23,"#8d8b83"); rect(cx+2,y-15,4,23,"#8d8b83"); rect(cx-10,y+9,20,9,"#73553b");
    } else if(ready==="chaingun"){
      rect(cx-17,y,34,21,"#4e5150"); rect(cx-9,y-18,5,24,"#878a88"); rect(cx+4,y-18,5,24,"#878a88"); rect(cx-13,y+10,26,9,"#313333");
    } else if(ready==="rocket"){
      rect(cx-15,y+1,30,23,"#47433f"); rect(cx-4,y-18,8,22,"#8a8b84"); rect(cx-10,y+10,20,9,"#65574a"); rect(cx-3,y-10,6,8,"#222");
    } else if(ready==="plasma"){
      rect(cx-12,y+3,24,21,"#283c42"); rect(cx-8,y-13,16,18,"#467f86"); rect(cx-4,y-18,8,10,"#9cd8d3"); rect(cx-9,y+10,18,8,"#15272b");
    } else if(ready==="bfg"){
      rect(cx-17,y,34,25,"#41564a"); rect(cx-8,y-16,16,18,"#6e967e"); rect(cx-5,y-23,10,10,"#aad9b4"); rect(cx-12,y+10,24,9,"#26382d");
    } else if(ready==="chainsaw"){
      rect(cx-18,y+2,36,21,"#6a3325"); rect(cx-9,y-10,18,12,"#8b3f2a");
      for(let i=-12;i<=12;i+=6)rect(cx+i,y-2,3,4,"#c2c2b8");
      rect(cx-21,y+18,42,4,"#313131");
    } else if(ready==="fist"){
      rect(cx-15,y+5,12,20,"#8b5f43"); rect(cx+3,y+3,12,22,"#8b5f43"); rect(cx-11,y+10,8,4,"#d8a57a"); rect(cx+3,y+8,8,4,"#d8a57a");
    } else {
      rect(cx-10,y+9,20,11,"#4b3a2f"); rect(cx-3,y-9,6,18,"#797979"); rect(cx-7,y+17,14,7,"#262626");
    }
    if(player.muzzle>0){
      const glow=ready==="rocket"||ready==="bfg"?10:ready==="chainsaw"?3:6;
      rect(cx-glow/2,y-23,glow,5,ready==="plasma"?"#72e8ff":"#ff672b");
      rect(cx-2,y-31,4,10,ready==="plasma"?"#d4ffff":"#ffe76a");
    }
  }
  function rect(a,b,c,d,color){ctx.fillStyle=color;ctx.fillRect(Math.floor(a),Math.floor(b),Math.ceil(c),Math.ceil(d));}
  function label(t,x,y,size,color,align){ctx.font="700 "+size+"px monospace";ctx.textAlign=align||"left";ctx.textBaseline="top";ctx.fillStyle=color;ctx.fillText(t,Math.floor(x),Math.floor(y));}

  function drawFace(){
    const cx=286,cy=177;
    rect(cx-11,cy-10,22,22,player.hp<35?"#713527":"#a16d4c");
    rect(cx-7,cy-5,4,3,"#eee4bd");rect(cx+3,cy-5,4,3,"#eee4bd");
    rect(cx-6,cy-5,2,3,"#111");rect(cx+4,cy-5,2,3,"#111");rect(cx-5,cy+6,10,3,"#39130e");
  }

  function drawHUD(){
    rect(0,160,W,40,"#2b2b2b");rect(0,160,W,2,"#5a5a5a");
    label("xLFr4n",28,165,7,"#bcbcbc","center");
    label(String(Math.max(0,player.hp|0)).padStart(3,"0")+"%",82,170,12,player.hp<35?"#e44":"#e7e7e7","center");
    label("HEALTH",82,184,5,"#777","center");
    label(String(Math.max(0,player.armor|0)).padStart(3,"0")+"%",134,170,12,"#e5e5e5","center");
    label("ARMOR",134,184,5,"#777","center");
    const w=WEAPONS[player.ready],ammo=w.ammo?player.ammo[w.ammo]:"-";
    label(String(ammo).padStart(3,"0"),186,170,12,"#f0f0f0","center");
    label(w.ammo?w.ammo.toUpperCase():"MELEE",186,184,5,"#777","center");
    label("KILLS",232,164,5,"#777","center");
    label(String(state.kills).padStart(2,"0")+"/"+String(state.totalKills).padStart(2,"0"),232,171,10,"#eee","center");
    label("ITEMS",299,164,5,"#777","center");
    label(String(state.items).padStart(2,"0")+"/"+String(state.totalItems).padStart(2,"0"),299,171,9,"#eee","center");
    drawFace();
    label(w.name,159,191,5,"#999","center");
  }

  function drawAutomap(){
    if(!state.automap)return;
    rect(0,0,W,160,"rgba(0,0,0,.90)");
    const s=4, ox=4, oy=4;
    for(let y=0;y<MAP.length;y++)for(let x=0;x<MAP[y].length;x++){
      if(!explored.has(key(x,y)))continue;
      const t=tile(x,y);
      if(t==="#")rect(ox+x*s,oy+y*s,s,s,"#555b63");
      else if(t==="D"||t==="B")rect(ox+x*s,oy+y*s,s,s,"#9b5335");
    }
    rect(ox+player.x*s-2,oy+player.y*s-2,4,4,"#ff3344");
    rect(ox+player.x*s+Math.cos(player.a)*6,oy+player.y*s+Math.sin(player.a)*6,3,3,"#fff");
    for(const e of enemies)if(e.alive&&explored.has(key(Math.floor(e.x),Math.floor(e.y))))rect(ox+e.x*s-1,oy+e.y*s-1,3,3,"#d14433");
    for(const p of pickups)if(!p.taken&&explored.has(key(Math.floor(p.x),Math.floor(p.y))))rect(ox+p.x*s-1,oy+p.y*s-1,2,2,"#53a79c");
    label("AUTOMAP",W-6,5,7,"#ddd","right");
    label("TAB / M",W-6,15,5,"#888","right");
  }

  function overlays(){
    if(state.mode==="playing"&&!state.paused)return;
    rect(0,0,W,160,"rgba(0,0,0,.72)");
    if(state.mode==="title"){
      label("MICRODOOM",160,42,16,"#eee","center");
      label("xLFr4n // SECTOR 01",160,64,7,"#ff5564","center");
      label("CLICK TO START · MOUSE LOOK",160,88,7,"#fff","center");
      label("WASD MOVE · SHIFT RUN · 1-8 WEAPONS · E USE",160,102,5,"#aaa","center");
      label("TAB/M MAP · P PAUSE · R RESTART · F2 SAVE · F3 LOAD",160,113,5,"#aaa","center");
    } else if(state.mode==="dead"){
      label("YOU DIED",160,52,16,"#e04444","center");
      label("KILLS "+state.kills+"/"+state.totalKills,160,76,6,"#bbb","center");
      label("PRESS R OR CLICK TO RESTART",160,94,7,"#fff","center");
    } else if(state.mode==="won"){
      label("SECTOR CLEARED",160,48,14,"#eee","center");
      label("TIME "+state.time.toFixed(1)+"s",160,70,7,"#ff5a68","center");
      label("KILLS "+state.kills+"/"+state.totalKills+" · ITEMS "+state.items+"/"+state.totalItems,160,82,6,"#fff","center");
      if(state.bestTime)label("BEST "+state.bestTime.toFixed(1)+"s",160,94,6,"#aaa","center");
      label("PRESS R TO RUN IT AGAIN",160,108,7,"#fff","center");
    } else if(state.paused){
      label("PAUSED",160,63,15,"#eee","center");
      label("PRESS P OR ESC TO RESUME",160,90,7,"#aaa","center");
    }
  }

  function render(){
    drawWorld(); drawHUD(); drawAutomap();
    if(state.damageFlash>0)rect(0,0,W,160,"rgba(220,30,25,"+clamp(state.damageFlash*2.4,0,.42)+")");
    if(state.pickupFlash>0)rect(0,0,W,160,"rgba(80,200,160,"+clamp(state.pickupFlash,0,.12)+")");
    if(state.messageUntil>performance.now()&&state.mode==="playing"){rect(45,7,230,11,"rgba(0,0,0,.65)");label(state.message,160,9,5,"#eee","center");}
    overlays();
  }

  function saveGame(){
    const payload={
      version:3,
      state:{
        time:state.time,
        kills:state.kills,
        items:state.items,
        totalKills:state.totalKills,
        totalItems:state.totalItems,
        automap:state.automap
      },
      player:{
        x:player.x,y:player.y,a:player.a,hp:player.hp,armor:player.armor,armorType:player.armorType,
        ammo:{...player.ammo},owned:{...player.owned},
        ready:player.ready,pending:player.pending,weaponState:player.weaponState,
        weaponTimer:player.weaponTimer,attackTimer:player.attackTimer
      },
      doors:[...doors.entries()].map(([k,v])=>[k,{...v}]),
      explored:[...explored],
      enemies:enemies.map((e,i)=>({
        index:i,x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,alive:e.alive,type:e.type,cd:e.cd,
        targetIndex:e.target===player?null:enemies.indexOf(e.target)
      })),
      pickups:pickups.map(p=>({type:p.type,x:p.x,y:p.y,value:p.value,taken:p.taken,phase:p.phase}))
    };
    localStorage.setItem(SAVE_KEY,JSON.stringify(payload));
    toast("GAME SAVED",1.2);
  }

  function loadGame(){
    try{
      const raw=localStorage.getItem(SAVE_KEY);
      if(!raw){toast("NO SAVE FOUND",1.2);return;}
      const s=JSON.parse(raw);
      if(s.version!==2&&s.version!==3)throw new Error("unsupported save");
      setupLevel();
      Object.assign(player,s.player);
      player.weaponState="ready"; player.pending=null; player.weaponTimer=0;
      player.ammo={bullets:0,shells:0,rockets:0,cells:0,...s.player.ammo};
      player.owned={fist:true,pistol:true,shotgun:false,chaingun:false,rocket:false,plasma:false,bfg:false,chainsaw:false,...s.player.owned};
      player.armorType=Number(s.player.armorType)||0;
      for(const [k,v] of s.doors||[])doors.set(k,v);
      for(const saved of s.enemies||[]){
        if(enemies[saved.index])Object.assign(enemies[saved.index],saved);
      }
      for(const e of enemies){
        e.target=(e.targetIndex==null)?player:enemies[e.targetIndex]||player;
        delete e.index; delete e.targetIndex;
      }
      pickups.length=0;
      for(const saved of s.pickups||[])pickups.push({...saved});
      state.time=Number(s.state.time)||0;
      state.kills=Number(s.state.kills)||0;
      state.totalKills=Math.max(state.kills,Number(s.state.totalKills)||enemies.length);
      state.items=Number(s.state.items)||0;
      state.totalItems=Math.max(state.items,Number(s.state.totalItems)||pickups.length);
      state.automap=!!s.state.automap;
      explored.clear();
      for(const cell of s.explored||[])explored.add(cell);
      explored.add(key(Math.floor(player.x),Math.floor(player.y)));
      state.mode="playing";
      state.paused=false;
      soundAlert=0;
      toast("GAME LOADED",1.2);
    }catch(e){
      toast("SAVE DATA INVALID",1.3);
    }
  }


  function lockMouse(){initAudio();canvas.requestPointerLock?.();}

  canvas.addEventListener("click",()=>{
    initAudio();
    if(state.mode==="title"||state.mode==="dead"||state.mode==="won"){newGame();lockMouse();}
    else if(state.mode==="playing"&&!state.paused)lockMouse();
  });

  document.addEventListener("mousemove",(e)=>{
    if(state.mode==="playing"&&!state.paused&&document.pointerLockElement===canvas)player.a=wrapAngle(player.a+e.movementX*.00255);
  });

  addEventListener("mousedown",(e)=>{
    if(e.button!==0)return;
    keys.MouseLeft=true;initAudio();
    if(state.mode==="playing"&&!state.paused){
      shoot();
      lockMouse();
    }
  });
  addEventListener("mouseup",(e)=>{if(e.button===0)keys.MouseLeft=false;});
  addEventListener("blur",()=>{for(const k of Object.keys(keys))keys[k]=false;});

  addEventListener("keydown",(e)=>{
    keys[e.code]=true;
    if(["Space","Tab","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","F2","F3"].includes(e.code))e.preventDefault();
    initAudio();

    if(e.code==="Enter"&&!e.repeat&&state.mode==="title"){newGame();lockMouse();}
    if(e.code==="KeyR"&&!e.repeat&&(state.mode==="dead"||state.mode==="won")){newGame();lockMouse();}
    if(e.code==="KeyP"&&!e.repeat&&state.mode==="playing"){
      state.paused=!state.paused;
      if(state.paused)document.exitPointerLock?.();
    }
    if(e.code==="Escape"&&!e.repeat&&state.mode==="playing"){
      state.paused=!state.paused;
      if(state.paused)document.exitPointerLock?.();
    }
    if((e.code==="Tab"||e.code==="KeyM")&&!e.repeat)state.automap=!state.automap;
    if(e.code==="KeyE"&&!e.repeat&&state.mode==="playing"&&!state.paused)useDoor();
    if(e.code==="Digit1"&&!e.repeat)selectWeapon("fist");
    if(e.code==="Digit2"&&!e.repeat)selectWeapon("pistol");
    if(e.code==="Digit3"&&!e.repeat)selectWeapon("shotgun");
    if(e.code==="Digit4"&&!e.repeat)selectWeapon("chaingun");
    if(e.code==="Digit5"&&!e.repeat)selectWeapon("rocket");
    if(e.code==="Digit6"&&!e.repeat)selectWeapon("plasma");
    if(e.code==="Digit7"&&!e.repeat)selectWeapon("bfg");
    if(e.code==="Digit8"&&!e.repeat)selectWeapon("chainsaw");
    if(e.code==="KeyQ"&&!e.repeat)nextWeapon();
    if(e.code==="F2"&&!e.repeat&&state.mode==="playing"&&!state.paused&&player.weaponState==="ready")saveGame();
    if(e.code==="F3"&&!e.repeat&&state.mode==="playing")loadGame();
    if(e.code==="Space"&&!e.repeat&&state.mode==="playing"&&!state.paused)shoot();
  });

  addEventListener("keyup",(e)=>{keys[e.code]=false;});

  function loop(now){
    const dt=Math.min(MAX_DT,Math.max(.001,(now-last)/1000));
    last=now;
    accumulator=Math.min(accumulator+dt,.2);
    let steps=0;
    while(accumulator>=SIM_DT&&steps<5){
      update(SIM_DT);
      accumulator-=SIM_DT;
      steps++;
    }
    render();
    requestAnimationFrame(loop);
  }

  newGame();
  state.mode="title";
  requestAnimationFrame(loop);
})();