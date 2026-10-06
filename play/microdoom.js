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
    "######.################.######",
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
  const exit = { x: 27.5, y: 20.5 };

  const WEAPONS = {
    fist: { name: "FIST", ammo: null, damage: [20, 40], cooldown: 0.42, range: 0.95, pellets: 1, spread: 0, auto: false },
    pistol: { name: "PISTOL", ammo: "bullets", damage: [15, 25], cooldown: 0.30, range: 18, pellets: 1, spread: 0.018, auto: true },
    shotgun: { name: "SHOTGUN", ammo: "shells", damage: [5, 15], cooldown: 0.92, range: 16, pellets: 7, spread: 0.085, auto: false },
    chaingun: { name: "CHAINGUN", ammo: "bullets", damage: [5, 15], cooldown: 0.10, range: 18, pellets: 1, spread: 0.035, auto: true }
  };

  const ENEMIES = {
    zombieman: { hp: 20, speed: 0.78, radius: 0.23, sight: 11, attackRange: 7, cooldown: 1.30, damage: 8, projectile: false },
    imp: { hp: 60, speed: 0.64, radius: 0.27, sight: 12, attackRange: 8, cooldown: 1.65, damage: 12, projectile: true },
    demon: { hp: 150, speed: 0.96, radius: 0.35, sight: 10, attackRange: 1.0, cooldown: 1.05, damage: 18, projectile: false },
    cacodemon: { hp: 400, speed: 0.50, radius: 0.38, sight: 14, attackRange: 9, cooldown: 2.0, damage: 18, projectile: true }
  };

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
    hp: 100, armor: 0,
    ammo: { bullets: 70, shells: 8 },
    owned: { fist: true, pistol: true, shotgun: false, chaingun: false },
    ready: "pistol", pending: null,
    weaponTimer: 0, attackTimer: 0, muzzle: 0, recoil: 0,
    bob: 0, vx: 0, vy: 0
  };

  const enemies = [];
  const pickups = [];
  const projectiles = [];
  const particles = [];
  const doors = new Map();
  const explored = new Set();
  const keys = Object.create(null);
  const zBuffer = new Float32Array(W);
  let last = performance.now();
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
    const nx = body.x + dx;
    const ny = body.y + dy;
    if (!blocked(nx, body.y, r)) body.x = nx;
    if (!blocked(body.x, ny, r)) body.y = ny;
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

  function spawnEnemy(type, x, y) {
    const p = findFloorNear(x, y);
    const d = ENEMIES[type];
    enemies.push({
      type, x: p.x, y: p.y, hp: d.hp, maxHp: d.hp, alive: true,
      cd: rand(0.4, d.cooldown), pain: 0, state: "idle",
      angle: 0, phase: rand(0, TAU), strafe: Math.random() < 0.5 ? -1 : 1
    });
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
    spawnEnemy("imp", 14.5, 3.5);
    spawnEnemy("zombieman", 24.5, 4.5);
    spawnEnemy("demon", 6.5, 9.5);
    spawnEnemy("imp", 25.5, 9.5);
    spawnEnemy("zombieman", 15.5, 9.5);
    spawnEnemy("demon", 7.5, 15.5);
    spawnEnemy("imp", 17.5, 15.5);
    spawnEnemy("cacodemon", 25.5, 16.5);
    spawnEnemy("zombieman", 22.5, 20.5);

    spawnPickup("clip", 4.5, 3.5, 10);
    spawnPickup("shells", 13.5, 3.5, 4);
    spawnPickup("stim", 8.5, 7.5, 10);
    spawnPickup("armor", 25.5, 4.5, 50);
    spawnPickup("shotgun", 4.5, 9.5, 1);
    spawnPickup("clipbox", 14.5, 7.5, 20);
    spawnPickup("medkit", 5.5, 15.5, 25);
    spawnPickup("shellbox", 16.5, 14.5, 8);
    spawnPickup("keyblue", 16.5, 9.5, 1);
    spawnPickup("chaingun", 25.5, 14.5, 1);
    spawnPickup("soulsphere", 26.5, 20.5, 100);

    state.kills = 0;
    state.totalKills = enemies.length;
    state.items = 0;
    state.totalItems = pickups.length;
    explored.add(key(Math.floor(player.x), Math.floor(player.y)));
  }

  function resetPlayer() {
    Object.assign(player, {
      x: playerSpawn.x, y: playerSpawn.y, a: playerSpawn.a,
      hp: 100, armor: 0, ammo: { bullets: 70, shells: 8 },
      owned: { fist: true, pistol: true, shotgun: false, chaingun: false },
      ready: "pistol", pending: null, weaponTimer: 0, attackTimer: 0,
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
      punch:[125,45,.09,"triangle",.045],
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
    if (state.mode !== "playing") return;
    const absorb = Math.min(player.armor, amount * 0.5);
    player.armor -= absorb;
    player.hp -= amount - absorb;
    state.damageFlash = 0.18;
    beep("hurt");
    if (player.hp <= 0) {
      player.hp = 0; state.mode = "dead"; document.exitPointerLock?.();
      beep("death");
    }
  }

  function hasKeycard() {
    return pickups.some(p => p.type === "keyblue" && p.taken);
  }

  function useDoor() {
    const fx = player.x + Math.cos(player.a) * 1.15;
    const fy = player.y + Math.sin(player.a) * 1.15;
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const t = tile(tx, ty);
    if (t !== "D" && t !== "B") {
      toast("NOTHING TO USE", 1.0); return;
    }
    const d = doors.get(key(tx, ty));
    if (d.locked && !hasKeycard()) {
      toast("BLUE KEYCARD REQUIRED", 1.5); beep("door"); return;
    }
    d.open = !d.open;
    toast(d.open ? "DOOR OPEN" : "DOOR CLOSED", 1.0);
    beep("door");
  }

  function selectWeapon(name) {
    if (!player.owned[name]) return;
    const w = WEAPONS[name];
    if (w.ammo && player.ammo[w.ammo] <= 0) return;
    if (player.pending === name || player.ready === name) return;
    player.pending = name;
    player.weaponTimer = 0.18;
  }

  function nextWeapon() {
    const order = ["fist", "pistol", "shotgun", "chaingun"];
    const i = order.indexOf(player.ready);
    for (let n = 1; n <= order.length; n++) {
      const w = order[(i + n) % order.length];
      if (player.owned[w] && (!WEAPONS[w].ammo || player.ammo[WEAPONS[w].ammo] > 0)) { selectWeapon(w); return; }
    }
  }

  function chooseFallback() {
    if (player.owned.chaingun && player.ammo.bullets) return "chaingun";
    if (player.owned.shotgun && player.ammo.shells) return "shotgun";
    if (player.ammo.bullets) return "pistol";
    return "fist";
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

  function killEnemy(e) {
    if (!e.alive) return;
    e.alive = false; e.state = "dead";
    state.kills++;
    impact(e.x, e.y, e.type === "cacodemon" ? "230,75,55" : "205,65,40", 10);
    if (Math.random() < 0.28) {
      const type = Math.random() < 0.65 ? "clip" : "shells";
      spawnPickup(type, e.x, e.y, type === "clip" ? 10 : 4);
      state.totalItems++;
    }
  }

  function shoot() {
    if (state.mode !== "playing" || state.paused || player.weaponTimer > 0 || player.attackTimer > 0) return;
    const name = player.ready, w = WEAPONS[name];
    if (w.ammo && player.ammo[w.ammo] <= 0) {
      selectWeapon(chooseFallback()); toast("NO AMMO", 1.0); return;
    }
    if (w.ammo) player.ammo[w.ammo]--;
    player.attackTimer = w.cooldown;
    player.muzzle = .07;
    player.recoil = name === "shotgun" ? 5 : 2;

    if (name === "fist") {
      const e = visibleTarget(player.a, w.range, .16);
      if (e) { e.hp -= int(w.damage[0], w.damage[1]); e.pain = .16; if (e.hp <= 0) killEnemy(e); impact(e.x,e.y,"255,210,170",3); }
      beep("punch"); return;
    }

    for (let i = 0; i < w.pellets; i++) {
      const a = player.a + rand(-w.spread, w.spread);
      const wall = rayCast(player.x, player.y, a);
      const e = visibleTarget(a, w.range, .10 + w.spread);
      if (e) {
        const d = Math.hypot(e.x-player.x,e.y-player.y);
        if (d < wall.dist + .05) {
          e.hp -= int(w.damage[0],w.damage[1]);
          e.pain = .13;
          if (e.hp <= 0) killEnemy(e);
          impact(e.x,e.y,"255,210,170",1);
        }
      } else {
        impact(player.x+Math.cos(a)*wall.dist, player.y+Math.sin(a)*wall.dist, "180,180,180", 1);
      }
    }
    beep(name);
  }

  function enemyAttack(e) {
    const d = ENEMIES[e.type];
    if (d.projectile) {
      projectiles.push({
        x:e.x, y:e.y,
        a:Math.atan2(player.y-e.y,player.x-e.x),
        speed:e.type==="cacodemon" ? 2.6 : 4.1,
        damage:d.damage, life:5
      });
    } else {
      const a = Math.atan2(player.y-e.y,player.x-e.x);
      const wall = rayCast(e.x,e.y,a);
      const dist = Math.hypot(player.x-e.x,player.y-e.y);
      if (wall.dist >= dist-.05 && Math.random() < .72) hurt(d.damage);
    }
    e.cd = d.cooldown;
    e.attackFlash = .1;
    beep("monster");
  }

  function moveEnemy(e, dx, dy) {
    const r = ENEMIES[e.type].radius;
    let nx=e.x+dx, ny=e.y+dy;
    if (!blocked(nx,e.y,r) && !enemyOverlap(e,nx,e.y)) e.x=nx;
    if (!blocked(e.x,ny,r) && !enemyOverlap(e,e.x,ny)) e.y=ny;
  }

  function enemyOverlap(me,x,y) {
    return enemies.some(e => e !== me && e.alive && Math.hypot(e.x-x,e.y-y) < .40);
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.alive) continue;
      const d=ENEMIES[e.type];
      e.cd-=dt; e.pain=Math.max(0,e.pain-dt); e.attackFlash=Math.max(0,(e.attackFlash||0)-dt);
      if (e.pain > 0) continue;
      const dx=player.x-e.x, dy=player.y-e.y, dist=Math.hypot(dx,dy);
      const sees=lineOfSight(e.x,e.y,player.x,player.y);
      e.angle=Math.atan2(dy,dx);

      if (dist <= d.attackRange && sees) {
        if (e.cd <= 0) enemyAttack(e);
        continue;
      }
      if (sees && dist < d.sight) {
        e.state="chase";
        const nx=dx/Math.max(dist,.001), ny=dy/Math.max(dist,.001);
        const orbit=(e.type==="demon" ? .06 : .18)*e.strafe;
        const sp=d.speed*dt;
        moveEnemy(e,(nx-ny*orbit)*sp,(ny+nx*orbit)*sp);
      } else {
        e.state="idle";
        e.phase += dt;
        const sp=d.speed*.12*dt;
        moveEnemy(e,Math.cos(e.phase)*sp,Math.sin(e.phase)*sp);
      }
    }
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      p.life-=dt;
      const step=p.speed*dt, nx=p.x+Math.cos(p.a)*step, ny=p.y+Math.sin(p.a)*step;
      if (blocked(nx,ny,.07)) { p.life=0; impact(p.x,p.y,"255,120,50",4); continue; }
      p.x=nx; p.y=ny;
      if (Math.hypot(p.x-player.x,p.y-player.y) < .22) { p.life=0; hurt(p.damage); impact(p.x,p.y,"255,120,50",5); }
    }
    for(let i=projectiles.length-1;i>=0;i--) if(projectiles[i].life<=0) projectiles.splice(i,1);
  }

  function updateParticles(dt) {
    for (const p of particles) { p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.92; p.vy*=.92; }
    for(let i=particles.length-1;i>=0;i--) if(particles[i].life<=0) particles.splice(i,1);
  }

  function collect() {
    for (const p of pickups) {
      if (p.taken || Math.hypot(player.x-p.x,player.y-p.y)>.42) continue;
      let take=true;
      if (p.type==="clip"||p.type==="clipbox") {
        if(player.ammo.bullets>=200) take=false; else player.ammo.bullets=Math.min(200,player.ammo.bullets+p.value);
      } else if (p.type==="shells"||p.type==="shellbox") {
        if(player.ammo.shells>=50) take=false; else player.ammo.shells=Math.min(50,player.ammo.shells+p.value);
      } else if (p.type==="stim"||p.type==="medkit") {
        if(player.hp>=100) take=false; else player.hp=Math.min(100,player.hp+p.value);
      } else if (p.type==="armor") {
        if(player.armor>=100) take=false; else player.armor=Math.min(100,player.armor+p.value);
      } else if (p.type==="soulsphere") player.hp=Math.min(200,player.hp+p.value);
      else if (p.type==="shotgun") { player.owned.shotgun=true; player.ammo.shells=Math.min(50,player.ammo.shells+4); player.pending="shotgun"; }
      else if (p.type==="chaingun") { player.owned.chaingun=true; player.ammo.bullets=Math.min(200,player.ammo.bullets+20); player.pending="chaingun"; }
      else if (p.type==="keyblue") toast("BLUE KEYCARD ACQUIRED",2);
      if(!take) continue;
      p.taken=true; state.items++; state.pickupFlash=.16; beep(p.type==="keyblue" ? "key" : "pickup");
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
    state.damageFlash=Math.max(0,state.damageFlash-dt);
    state.pickupFlash=Math.max(0,state.pickupFlash-dt);
    player.attackTimer=Math.max(0,player.attackTimer-dt);
    player.weaponTimer=Math.max(0,player.weaponTimer-dt);
    player.muzzle=Math.max(0,player.muzzle-dt);
    player.recoil=Math.max(0,player.recoil-dt*22);
    if(player.weaponTimer===0&&player.pending){player.ready=player.pending;player.pending=null;}

    updateMovement(dt);
    collect();
    updateEnemies(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    explored.add(key(Math.floor(player.x),Math.floor(player.y)));

    const atExit=Math.hypot(player.x-exit.x,player.y-exit.y)<.72;
    if(atExit && state.kills>=state.totalKills){
      state.mode="won";
      if(!state.bestTime || state.time<state.bestTime){
        state.bestTime=state.time;
        localStorage.setItem("xlfr4n-microdoom-best",String(state.time));
      }
      document.exitPointerLock?.();
      beep("key");
    } else if(atExit) {
      toast("EXIT LOCKED · CLEAR ALL DEMONS",1.5);
    }

    if(keys.MouseLeft){
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
    for(const e of enemies)if(e.alive){
      const dx=e.x-player.x,dy=e.y-player.y,d=Math.hypot(dx,dy),da=angleDiff(Math.atan2(dy,dx),player.a);
      if(Math.abs(da)<FOV*.76&&lineOfSight(player.x,player.y,e.x,e.y))vis.push({type:"enemy",d,da,o:e});
    }
    for(const p of pickups)if(!p.taken){
      const dx=p.x-player.x,dy=p.y-player.y,d=Math.hypot(dx,dy),da=angleDiff(Math.atan2(dy,dx),player.a);
      if(Math.abs(da)<FOV*.8)vis.push({type:"pickup",d,da,o:p});
    }
    for(const p of projectiles){
      const dx=p.x-player.x,dy=p.y-player.y,d=Math.hypot(dx,dy),da=angleDiff(Math.atan2(dy,dx),player.a);
      if(Math.abs(da)<FOV*.8)vis.push({type:"fireball",d,da,o:p});
    }
    vis.sort((a,b)=>b.d-a.d);
    for(const s of vis){
      const sx=Math.round(W/2+(s.da/FOV)*W);
      const col=clamp(sx,0,W-1);
      if(zBuffer[col]<s.d*Math.cos(s.da)-.08)continue;
      if(s.type==="enemy")drawEnemy(s.o,sx,s.d);
      else if(s.type==="pickup")drawPickup(s.o,sx,s.d);
      else drawFireball(sx,s.d);
    }
    drawParticles();
    drawWeapon();
  }

  function drawEnemy(e,sx,d){
    const z=clamp(11/Math.max(.25,d),.25,3),w=Math.max(5,Math.floor((e.type==="cacodemon"?34:e.type==="demon"?28:23)*z)),h=Math.max(8,Math.floor((e.type==="cacodemon"?31:e.type==="demon"?38:34)*z));
    const left=Math.floor(sx-w/2),top=Math.floor(80-h*.55+Math.sin(performance.now()/120+e.phase)*Math.min(2,z));
    if(e.type==="cacodemon"){
      rect(left,top+h*.18,w,h*.64,"#73423e");rect(left+w*.18,top,w*.64,h*.28,"#98564c");
      rect(left+w*.25,top+h*.3,w*.16,h*.12,"#ffe56b");rect(left+w*.59,top+h*.3,w*.16,h*.12,"#ffe56b");
      rect(left+w*.30,top+h*.32,w*.06,h*.07,"#111");rect(left+w*.64,top+h*.32,w*.06,h*.07,"#111");
    }else if(e.type==="demon"){
      rect(left+w*.12,top+h*.18,w*.76,h*.70,"#67251f");rect(left+w*.18,top,w*.64,h*.48,"#92382a");
      rect(left+w*.26,top+h*.23,w*.13,h*.1,"#f3c958");rect(left+w*.61,top+h*.23,w*.13,h*.1,"#f3c958");
      rect(left+w*.30,top+h*.25,w*.05,h*.06,"#111");rect(left+w*.65,top+h*.25,w*.05,h*.06,"#111");
    }else{
      const base=e.type==="imp"?"#883325":"#595b56";
      rect(left+w*.2,top+h*.2,w*.6,h*.62,base);rect(left+w*.27,top+h*.06,w*.46,h*.30,e.type==="imp"?"#a6482e":"#6a6d67");
      rect(left+w*.31,top+h*.22,w*.1,h*.09,"#ffe76a");rect(left+w*.59,top+h*.22,w*.1,h*.09,"#ffe76a");
      rect(left+w*.34,top+h*.24,w*.04,h*.06,"#111");rect(left+w*.63,top+h*.24,w*.04,h*.06,"#111");
    }
    if(e.pain>0)rect(left,top,w,h,"rgba(255,255,255,.4)");
    if(e.hp<e.maxHp){rect(left,top-3,w,2,"#161616");rect(left,top-3,Math.max(1,w*clamp(e.hp/e.maxHp,0,1)),2,"#d13b2c");}
  }

  function pickupColor(t){return {clip:"#c9bd7b",clipbox:"#a58e55",shells:"#dbc58c",shellbox:"#b08d5a",stim:"#52a86a",medkit:"#e7e7e7",armor:"#3f8d94",shotgun:"#89633d",chaingun:"#707678",keyblue:"#4a87ea",soulsphere:"#59aaa3"}[t]||"#ddd";}

  function drawPickup(p,sx,d){
    const z=clamp(7/Math.max(.25,d),.25,3),s=Math.max(4,Math.floor(8*z)),y=Math.floor(80-s+Math.sin(performance.now()/260+p.phase)*2*z);
    rect(sx-s/2,y,s,s,pickupColor(p.type));rect(sx-s*.25,y+s*.25,s*.5,s*.5,"#111");
    if(p.type==="keyblue")rect(sx-s*.1,y+s*.12,s*.2,s*.72,"#69a8ff");
    if(p.type==="soulsphere"){ctx.strokeStyle=pickupColor(p.type);ctx.strokeRect(sx-s*.7,y-s*.15,s*1.4,s*1.4);}
  }

  function drawFireball(sx,d){
    const z=clamp(4/Math.max(.25,d),.25,3),r=Math.max(2,Math.floor(4*z)),y=80+Math.sin(performance.now()/80+d)*2;
    rect(sx-r,y-r,r*2,r*2,"#e85224");rect(sx-r*.4,y-r*.4,r*.8,r*.8,"#ffe66a");
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

  function drawWeapon(){
    const bob=Math.sin(player.bob)*Math.min(2.5,Math.hypot(player.vx,player.vy)*.9),y=137+bob+player.recoil,cx=160;
    if(player.ready==="shotgun"){rect(cx-13,y,26,24,"#49392d");rect(cx-6,y-15,4,23,"#8d8b83");rect(cx+2,y-15,4,23,"#8d8b83");rect(cx-10,y+9,20,9,"#73553b");}
    else if(player.ready==="chaingun"){rect(cx-17,y,34,21,"#4e5150");rect(cx-9,y-18,5,24,"#878a88");rect(cx+4,y-18,5,24,"#878a88");rect(cx-13,y+10,26,9,"#313333");}
    else if(player.ready==="fist"){rect(cx-15,y+5,12,20,"#8b5f43");rect(cx+3,y+3,12,22,"#8b5f43");rect(cx-11,y+10,8,4,"#d8a57a");rect(cx+3,y+8,8,4,"#d8a57a");}
    else{rect(cx-10,y+9,20,11,"#4b3a2f");rect(cx-3,y-9,6,18,"#797979");rect(cx-7,y+17,14,7,"#262626");}
    if(player.muzzle>0){rect(cx-4,y-23,8,5,"#ff672b");rect(cx-2,y-31,4,10,"#ffe76a");}
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
      label("WASD MOVE · SHIFT RUN · 1-4 WEAPONS · E USE",160,102,5,"#aaa","center");
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
    const payload={state:{time:state.time,kills:state.kills,items:state.items},player:{x:player.x,y:player.y,a:player.a,hp:player.hp,armor:player.armor,ammo:player.ammo,owned:player.owned,ready:player.ready},doors:[...doors],enemies:enemies.map(e=>({x:e.x,y:e.y,hp:e.hp,alive:e.alive,type:e.type,cd:e.cd})),pickups:pickups.map(p=>({type:p.type,x:p.x,y:p.y,value:p.value,taken:p.taken}))};
    localStorage.setItem(SAVE_KEY,JSON.stringify(payload));
    toast("GAME SAVED",1.2);
  }

  function loadGame(){
    try{
      const raw=localStorage.getItem(SAVE_KEY); if(!raw){toast("NO SAVE FOUND",1.2);return;}
      const s=JSON.parse(raw); setupLevel();
      Object.assign(player,s.player);
      state.time=s.state.time;state.kills=s.state.kills;state.items=s.state.items;
      for(const [k,v] of s.doors){doors.set(k,v);}
      for(let i=0;i<s.enemies.length&&i<enemies.length;i++)Object.assign(enemies[i],s.enemies[i]);
      for(let i=0;i<s.pickups.length&&i<pickups.length;i++)Object.assign(pickups[i],s.pickups[i]);
      state.mode="playing";state.paused=false;toast("GAME LOADED",1.2);
    }catch(e){toast("SAVE DATA INVALID",1.3);}
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
    if(state.mode==="playing"&&!state.paused)lockMouse();
  });
  addEventListener("mouseup",(e)=>{if(e.button===0)keys.MouseLeft=false;});
  addEventListener("blur",()=>{for(const k of Object.keys(keys))keys[k]=false;});

  addEventListener("keydown",(e)=>{
    keys[e.code]=true;
    if(["Space","Tab","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
    initAudio();

    if(e.code==="Enter"&&state.mode==="title"){newGame();lockMouse();}
    if(e.code==="KeyR"&&(state.mode==="dead"||state.mode==="won")){newGame();lockMouse();}
    if(e.code==="KeyP"&&state.mode==="playing")state.paused=!state.paused;
    if(e.code==="Escape"&&state.mode==="playing"){
      state.paused=!state.paused;
      if(state.paused)document.exitPointerLock?.();
    }
    if(e.code==="Tab"||e.code==="KeyM")state.automap=!state.automap;
    if(e.code==="KeyE"&&state.mode==="playing"&&!state.paused)useDoor();
    if(e.code==="Digit1")selectWeapon("fist");
    if(e.code==="Digit2")selectWeapon("pistol");
    if(e.code==="Digit3")selectWeapon("shotgun");
    if(e.code==="Digit4")selectWeapon("chaingun");
    if(e.code==="KeyQ")nextWeapon();
    if(e.code==="F2"&&state.mode==="playing")saveGame();
    if(e.code==="F3"&&state.mode==="playing")loadGame();
    if(e.code==="Space"&&state.mode==="playing"&&!state.paused)shoot();
  });

  addEventListener("keyup",(e)=>{keys[e.code]=false;});

  function loop(now){
    const dt=Math.min(MAX_DT,Math.max(.001,(now-last)/1000));last=now;
    update(dt);render();requestAnimationFrame(loop);
  }

  newGame();
  state.mode="title";
  requestAnimationFrame(loop);
})();