// Deterministic, DOM-free simulation shared by the browser and Node tests.
export const CLASSES = {
  guardian: { name: 'Dawn Guardian', weapon: 'Celestial blade', special: 'Wingburst', color: '#f5cd74', hp: 135, speed: 240 },
  sunbow: { name: 'Sunbow Ranger', weapon: 'Solar arrows', special: 'Seven suns', color: '#74e5d9', hp: 100, speed: 270 },
  stormcaller: { name: 'Storm Oracle', weapon: 'Storm orbs', special: 'Heavenfall', color: '#b4a0ff', hp: 110, speed: 245 },
  marksman: { name: 'Horizon Marksman', weapon: 'Celestial rifle', special: 'Sunpiercer', color: '#8dd4ff', hp: 105, speed: 250 },
  brawler: { name: 'Dawn Pugilist', weapon: 'Hand-to-hand combos', special: 'Judgment strike', color: '#ffb58f', hp: 150, speed: 265 },
  creator: { name: 'The Creator', weapon: 'Divine light', special: 'Let there be light', color: '#fff3c4', hp: 9999, speed: 320 },
};
export const MODES = {
  survival: { name: 'Gatekeeper', description: 'Protect the gates through five waves.', target: 5 },
  relic: { name: 'Relic Run', description: 'Recover twelve sacred relics from the shades.', target: 12 },
  trial: { name: 'Solar Trial', description: 'Earn 1,000 glory before ninety seconds expire.', target: 1000 },
};
export const REALMS = {
  citadel: { name: 'Sky Citadel', accent: '#72e1da', background: '#101c35' },
  duat: { name: 'Duat Breach', accent: '#ba98ff', background: '#211735' },
  sands: { name: 'Sands of Eternity', accent: '#edba73', background: '#302419' },
  fields: { name: 'Heaven’s Fields', accent: '#f9e8b1', background: '#16352e' },
};
export const CONTRACTS = {
  hunter: { name: 'Shade Hunter', description: 'Defeat 15 invaders.', target: 15, reward: 50 },
  survivor: { name: 'Unbroken Wings', description: 'Stay alive for 60 seconds.', target: 60, reward: 50 },
  collector: { name: 'Sacred Salvage', description: 'Collect 10 essence.', target: 10, reward: 50 },
};
export const UPGRADE_COSTS = { vigor: [45, 90, 150], power: [45, 90, 150], focus: [45, 90, 150] };

const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const upgradeLevel = n => clamp(Math.floor(Number(n) || 0), 0, 3);
const actors = g => g.players || [g.player];
const livingActors = g => actors(g).filter(p => p.hp > 0);
function nearestActor(g, point) {
  let nearest, nearestDistance = Infinity;
  for (const player of actors(g)) {
    const d = distance(player, point);
    if (player.hp > 0 && d < nearestDistance) { nearest = player; nearestDistance = d; }
  }
  return nearest;
}
// Ability helpers use the current actor context; the shared world is still stepped once.
function withActor(g, player, operation) {
  const original = [g.player, g.classId, g.upgrades];
  g.player = player;
  g.classId = player.classId || g.classId;
  g.upgrades = player.upgrades || g.upgrades;
  try { return operation(); }
  finally { [g.player, g.classId, g.upgrades] = original; }
}
function random(g) {
  g.seed = (Math.imul(1664525, g.seed) + 1013904223) >>> 0;
  return g.seed / 4294967296;
}
function pointClear(g, x, y, r) {
  return !g.obstacles.some(o => x + r > o.x && x - r < o.x + o.w && y + r > o.y && y - r < o.y + o.h);
}
function move(g, actor, dx, dy) {
  const x = clamp(actor.x + dx, 28 + actor.r, g.width - 28 - actor.r);
  if (pointClear(g, x, actor.y, actor.r)) actor.x = x;
  const y = clamp(actor.y + dy, 28 + actor.r, g.height - 28 - actor.r);
  if (pointClear(g, actor.x, y, actor.r)) actor.y = y;
}
function particles(g, x, y, color, count = 8) {
  for (let i = 0; i < count && g.particles.length < 500; i++) {
    const a = random(g) * TAU, speed = 40 + random(g) * 145;
    const life = .22 + random(g) * .45;
    g.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, maxLife: life, color, size: 2 + random(g) * 3 });
  }
}
function effect(g, x, y, r, kind, facing = 0, color = CLASSES[g.classId].color) {
  const life = kind === 'slash' ? .18 : .5;
  g.effects.push({ x, y, r, kind, facing, color, life, maxLife: life, ownerId: g.player.id || null });
}
function spawnWave(g) {
  g.wave++;
  g.message = `Wave ${g.wave}${g.wave === 5 && g.mode === 'survival' ? ' · the final breach' : ' · protect Heaven'}`;
  const count = Math.min(17, 3 + g.wave * 2);
  for (let i = 0; i < count; i++) {
    const roll = random(g);
    const type = g.wave >= 3 && roll > .82 ? 'brute' : g.wave >= 2 && roll > .55 ? 'archer' : roll < .18 ? 'wisp' : 'shade';
    let x, y, attempts = 0;
    do {
      const edge = Math.floor(random(g) * 4);
      x = edge === 0 ? 58 : edge === 1 ? 1142 : 70 + random(g) * 1060;
      y = edge === 2 ? 58 : edge === 3 ? 742 : 70 + random(g) * 660;
    } while ((livingActors(g).some(p => distance({ x, y }, p) < 290) || !pointClear(g, x, y, 24)) && ++attempts < 40);
    const hp = (type === 'brute' ? 125 : type === 'archer' ? 48 : type === 'wisp' ? 28 : 42) + Math.max(0, g.wave - 2) * 4;
    g.enemies.push({ id: g.nextId++, x, y, r: type === 'brute' ? 25 : type === 'wisp' ? 13 : 18, hp, maxHp: hp, type,
      speed: (type === 'brute' ? 58 : type === 'archer' ? 80 : type === 'wisp' ? 123 : 88) + Math.min(g.wave, 8) * 3,
      attackCooldown: .6 + random(g) * 1.2, hitFlash: 0, color: type === 'brute' ? '#e294a0' : type === 'archer' ? '#d8a0ff' : '#bc82df', phase: random(g) * TAU });
  }
  g.waveTimer = -1;
}
export function createGame(options = {}) {
  const classId = Object.hasOwn(CLASSES, options.classId) ? options.classId : 'guardian';
  const mode = Object.hasOwn(MODES, options.mode) ? options.mode : 'survival';
  const realm = Object.hasOwn(REALMS, options.realm) ? options.realm : 'citadel';
  const contractId = Object.hasOwn(CONTRACTS, options.contractId) ? options.contractId : 'hunter';
  const upgrades = Object.fromEntries(['vigor', 'power', 'focus'].map(k => [k, upgradeLevel(options.upgrades?.[k])]));
  const maxHp = CLASSES[classId].hp + upgrades.vigor * 20;
  const maxEnergy = 100 + upgrades.focus * 15;
  const columns = realm === 'fields' ? [] : realm === 'sands' ? [[245, 215], [895, 525], [535, 115], [635, 615]] : [[270, 205], [870, 205], [270, 545], [870, 545]];
  const g = { width: 1200, height: 800, classId, mode, realm, upgrades, seed: (Number(options.seed) || 1) >>> 0,
    player: { x: 600, y: 440, r: 17, hp: maxHp, maxHp, energy: maxEnergy, maxEnergy, facing: -Math.PI / 2,
      attackCooldown: 0, dashCooldown: 0, specialCooldown: 0, dashTime: 0, dashX: 0, dashY: 0, invulnerable: 1.5, hitFlash: 0,
      crouching: false, blocking: false, aiming: false, jumpTime: 0, jumpCooldown: 0, jumpHeld: false,
      ammo: classId === 'marksman' ? 5 : 0, maxAmmo: classId === 'marksman' ? 5 : 0, reloadTime: 0, combo: 0, comboTime: 0, interactHeld: false },
    enemies: [], projectiles: [], particles: [], effects: [], pickups: [],
    obstacles: columns.map(([x, y]) => ({ x, y, w: 60, h: 60 })),
    hazards: realm === 'citadel' || realm === 'fields' ? [] : [{ x: 470, y: 340, r: 52, active: false, phase: 0 }, { x: 730, y: 460, r: 52, active: false, phase: 3 }],
    wave: 0, score: 0, kills: 0, essence: 0, relics: 0, time: 0, status: 'playing', message: 'The gates are yours to defend.', waveTimer: -1,
    mechanism: { levers: [{ x: 230, y: 620, on: false }, { x: 970, y: 620, on: false }], charge: 0, angle: 0, unlocked: false },
    contract: { id: contractId, progress: 0, target: CONTRACTS[contractId].target, completed: false }, nextId: 1, reward: 0, damageTaken: 0,
  };
  spawnWave(g);
  return g;
}
export function createCoopGame(options = {}, roster = []) {
  if (!Array.isArray(roster) || roster.length > 8) throw new RangeError('A cooperative roster must contain at most eight players.');
  if (roster.length === 0) roster = [{ id: 'player-1', name: 'Angel', classId: options.classId, upgrades: options.upgrades }];
  const ids = new Set();
  for (const entry of roster) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id)) throw new TypeError('Each cooperative player needs a unique nonempty string id.');
    ids.add(entry.id);
  }
  const g = createGame({ ...options, classId: roster[0].classId || options.classId, upgrades: roster[0].upgrades || options.upgrades });
  g.players = roster.map((entry, index) => {
    const source = index === 0 ? g : createGame({ ...options, classId: entry.classId, upgrades: entry.upgrades });
    const player = source.player;
    player.id = entry.id;
    player.name = String(entry.name || `Angel ${index + 1}`).slice(0, 32);
    player.classId = source.classId;
    player.upgrades = { ...source.upgrades };
    if (roster.length > 1) {
      const angle = -Math.PI / 2 + index / roster.length * TAU;
      player.x = 600 + Math.cos(angle) * 52;
      player.y = 440 + Math.sin(angle) * 52;
    }
    return player;
  });
  g.player = g.players[0];
  g.coop = true;
  return g;
}
function damagePlayer(g, amount, source, kind = 'contact') {
  const p = g.player;
  if (g.classId === 'creator' || p.invulnerable > 0 || p.hp <= 0) return;
  if (kind === 'projectile' && p.crouching) amount *= .6;
  const incomingAngle = source && (kind === 'projectile' ? Math.atan2(-source.vy, -source.vx) : Math.atan2(source.y - p.y, source.x - p.x));
  if (source && p.blocking && Math.abs(angleDelta(incomingAngle, p.facing)) < 1.25) {
    amount *= .3;
    effect(g, p.x, p.y, 38, 'block', p.facing);
  }
  p.hp = Math.max(0, p.hp - amount);
  p.invulnerable = .6;
  p.hitFlash = .18;
  g.damageTaken += amount;
  particles(g, p.x, p.y, '#ff8a9a', 10);
}
function hitEnemy(g, e, damage, knockback = 0) {
  if (e.hp <= 0) return;
  e.hp -= damage;
  e.hitFlash = .12;
  if (knockback) {
    const a = Math.atan2(e.y - g.player.y, e.x - g.player.x);
    move(g, e, Math.cos(a) * knockback, Math.sin(a) * knockback);
  }
  particles(g, e.x, e.y, CLASSES[g.classId].color, e.hp <= 0 ? 14 : 4);
  if (e.hp > 0) return;
  g.kills++;
  g.score += e.type === 'brute' ? 160 : e.type === 'archer' ? 110 : 80;
  g.pickups.push({ x: e.x, y: e.y, r: 8, kind: 'essence', value: 1 });
  if (g.mode === 'relic') g.pickups.push({ x: e.x + 12, y: e.y, r: 10, kind: 'relic', value: 1 });
  const roll = random(g);
  if (roll < .22) g.pickups.push({ x: e.x - 12, y: e.y, r: 9, kind: 'health', value: 22 });
  else if (roll < .42) g.pickups.push({ x: e.x - 12, y: e.y, r: 8, kind: 'energy', value: 24 });
}
function projectile(g, angle, damage, kind, speed = 620, offset = 0) {
  const p = g.player;
  const bullet = { x: p.x + Math.cos(angle) * 22, y: p.y + Math.sin(angle) * 22, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r: kind === 'orb' ? 9 : 5, life: 1.7 + offset, team: 'player', kind, damage, color: CLASSES[g.classId].color, ownerId: p.id || null };
  g.projectiles.push(bullet);
  return bullet;
}
function reload(g) {
  const p = g.player;
  if (g.classId === 'marksman' && p.ammo < p.maxAmmo && p.reloadTime <= 0) p.reloadTime = 1.8;
}
function attack(g) {
  const p = g.player;
  if (p.attackCooldown > 0 || p.reloadTime > 0 || p.blocking) return;
  const power = 1 + g.upgrades.power * .14;
  if (g.classId === 'creator') {
    p.attackCooldown = .3;
    effect(g, p.x, p.y, 180, 'nova');
    for (const enemy of g.enemies) if (distance(p, enemy) < 180 + enemy.r) hitEnemy(g, enemy, 150 * power, 30);
  } else if (g.classId === 'guardian') {
    p.attackCooldown = .34;
    effect(g, p.x, p.y, 105, 'slash', p.facing);
    for (const enemy of g.enemies) {
      const a = Math.atan2(enemy.y - p.y, enemy.x - p.x);
      if (distance(p, enemy) < 105 + enemy.r && Math.abs(angleDelta(a, p.facing)) < 1.22) hitEnemy(g, enemy, 43 * power, 14);
    }
  } else if (g.classId === 'brawler') {
    p.combo = p.combo % 3 + 1;
    p.comboTime = .8;
    p.attackCooldown = p.combo === 3 ? .34 : .19;
    effect(g, p.x, p.y, 70, 'punch', p.facing);
    for (const enemy of g.enemies) {
      const a = Math.atan2(enemy.y - p.y, enemy.x - p.x);
      if (distance(p, enemy) < 70 + enemy.r && Math.abs(angleDelta(a, p.facing)) < 1.15)
        hitEnemy(g, enemy, (p.combo === 3 ? 45 : 24) * power, p.combo === 3 ? 42 : 9);
    }
  } else if (g.classId === 'marksman') {
    if (p.ammo <= 0) { reload(g); return; }
    p.ammo--;
    p.attackCooldown = .8;
    const spread = p.aiming ? 0 : (random(g) - .5) * .12;
    projectile(g, p.facing + spread, (p.aiming ? 104 : 72) * power, 'rifle', 900);
    effect(g, p.x + Math.cos(p.facing) * 35, p.y + Math.sin(p.facing) * 35, 16, 'muzzle', p.facing);
  } else if (g.classId === 'sunbow') {
    p.attackCooldown = .24;
    projectile(g, p.facing, 29 * power, 'arrow', 780);
  } else {
    p.attackCooldown = .48;
    projectile(g, p.facing, 35 * power, 'orb', 480);
  }
}
function special(g) {
  const p = g.player;
  if (g.classId === 'creator') {
    if (p.specialCooldown > 0) return;
    p.specialCooldown = 1.5;
    for (const enemy of g.enemies) hitEnemy(g, enemy, Math.max(15000, enemy.hp));
    g.projectiles = g.projectiles.filter(b => b.team !== 'enemy');
    effect(g, p.x, p.y, 1300, 'nova');
    particles(g, p.x, p.y, CLASSES.creator.color, 50);
    return;
  }
  const cost = g.classId === 'guardian' || g.classId === 'brawler' ? 30 : g.classId === 'sunbow' ? 35 : 40;
  if (p.specialCooldown > 0 || p.energy < cost || p.blocking) return;
  p.energy -= cost;
  p.specialCooldown = Math.max(3, (g.classId === 'stormcaller' ? 8 : 6) - g.upgrades.focus * .6);
  const power = 1 + g.upgrades.power * .14;
  if (g.classId === 'marksman') {
    const bullet = projectile(g, p.facing, 150 * power, 'rifle', 900);
    bullet.pierce = 3;
    bullet.hitIds = [];
    effect(g, p.x, p.y, 48, 'nova');
  } else if (g.classId === 'sunbow') {
    for (let n = -3; n <= 3; n++) projectile(g, p.facing + n * .13, 48 * power, 'solar', 840);
    effect(g, p.x, p.y, 60, 'nova');
  } else {
    const radius = g.classId === 'guardian' ? 190 : g.classId === 'brawler' ? 145 : 330;
    const damage = g.classId === 'guardian' ? 65 : g.classId === 'brawler' ? 85 : 52;
    for (const e of g.enemies) if (distance(p, e) < radius + e.r) hitEnemy(g, e, damage * power, g.classId === 'brawler' ? 60 : 34);
    effect(g, p.x, p.y, radius, 'nova');
    if (g.classId === 'guardian') { p.hp = Math.min(p.maxHp, p.hp + 12); p.invulnerable = .6; }
    if (g.classId === 'stormcaller') g.projectiles = g.projectiles.filter(b => b.team !== 'enemy' || distance(p, b) > radius);
  }
  particles(g, p.x, p.y, CLASSES[g.classId].color, 28);
}
function finish(g, status, message) {
  if (g.status !== 'playing') return;
  g.status = status;
  g.message = message;
  g.reward = Math.floor(g.score / 35) + g.essence * 2 + (status === 'won' ? 35 : 5) + (g.contract.completed ? CONTRACTS[g.contract.id].reward : 0);
}
function updateContract(g) {
  const c = g.contract;
  c.progress = Math.min(c.target, c.id === 'hunter' ? g.kills : c.id === 'survivor' ? Math.floor(g.time) : g.essence);
  if (!c.completed && c.progress >= c.target) {
    c.completed = true;
    g.message = `Contract complete · ${CONTRACTS[c.id].name}`;
    effect(g, g.player.x, g.player.y, 110, 'heal', 0, '#f5cd74');
  }
}

function updatePlayer(g, dt, input) {
  const p = g.player;
  if (input.interact && !p.interactHeld && g.mechanism) {
    const lever = g.mechanism.levers.find(lever => distance(p, lever) <= 85);
    if (lever) {
      lever.on = !lever.on;
      g.message = lever.on ? 'Golden lever engaged · power both pulleys to open the gate' : 'Golden lever released · the mechanism slows';
    }
  }
  p.interactHeld = Boolean(input.interact);
  for (const key of ['attackCooldown', 'dashCooldown', 'specialCooldown', 'invulnerable', 'hitFlash', 'jumpTime', 'jumpCooldown', 'comboTime']) p[key] = Math.max(0, p[key] - dt);
  if (p.comboTime <= 0) p.combo = 0;
  if (p.reloadTime > 0) {
    p.reloadTime = Math.max(0, p.reloadTime - dt);
    if (p.reloadTime <= 0) p.ammo = p.maxAmmo;
  }
  p.crouching = Boolean(input.crouch) && p.jumpTime <= 0;
  p.blocking = Boolean(input.block) && p.energy > 1 && p.dashTime <= 0;
  p.aiming = Boolean(input.aim);
  p.energy = g.classId === 'creator' ? p.maxEnergy : clamp(p.energy + (p.blocking ? -14 : 9 + g.upgrades.focus * 1.5) * dt, 0, p.maxEnergy);
  if (input.jump && !p.jumpHeld && p.jumpCooldown <= 0) {
    p.jumpTime = .45; p.jumpCooldown = 2; p.crouching = false;
    effect(g, p.x, p.y, 30, 'jump');
  }
  p.jumpHeld = Boolean(input.jump);
  if (input.reload) reload(g);
  if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY) && Math.hypot(input.aimX - p.x, input.aimY - p.y) > 2) p.facing = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  let mx = Number.isFinite(input.moveX) ? clamp(input.moveX, -1, 1) : 0;
  let my = Number.isFinite(input.moveY) ? clamp(input.moveY, -1, 1) : 0;
  const length = Math.hypot(mx, my);
  if (length > 1) { mx /= length; my /= length; }
  if (input.dash && p.dashCooldown <= 0) {
    p.dashX = length > .1 ? mx : Math.cos(p.facing);
    p.dashY = length > .1 ? my : Math.sin(p.facing);
    p.dashTime = .18;
    p.dashCooldown = Math.max(1.4, 2.2 - g.upgrades.focus * .15);
    p.invulnerable = .3;
    effect(g, p.x, p.y, 32, 'dash');
  }
  if (p.dashTime > 0) {
    move(g, p, p.dashX * 760 * dt, p.dashY * 760 * dt);
    p.dashTime -= dt;
    particles(g, p.x, p.y, CLASSES[g.classId].color, 2);
  } else {
    const stance = (p.crouching ? .55 : 1) * (p.blocking ? .5 : 1) * (p.aiming && g.classId === 'marksman' ? .55 : 1);
    move(g, p, mx * CLASSES[g.classId].speed * stance * dt, my * CLASSES[g.classId].speed * stance * dt);
  }
  if (input.attack) attack(g);
  if (input.special) special(g);
}

export function updateGame(g, dt, input = {}) {
  return updateWorld(g, dt, () => input);
}
export function updateCoopGame(g, dt, inputsById = {}) {
  return updateWorld(g, dt, player => inputsById[player.id] || {});
}
function updateWorld(g, dt, inputFor) {
  if (g.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return g;
  dt = Math.min(dt, .05);
  g.time += dt;
  for (const player of actors(g)) if (player.hp > 0) withActor(g, player, () => updatePlayer(g, dt, inputFor(player)));
  if (g.mechanism) {
    const mechanism = g.mechanism;
    if (mechanism.levers.every(lever => lever.on)) {
      mechanism.charge = Math.min(1, mechanism.charge + dt * .25);
      mechanism.angle = (mechanism.angle + dt * (.5 + mechanism.charge * 3)) % TAU;
      if (!mechanism.unlocked && mechanism.charge >= 1) {
        mechanism.unlocked = true;
        g.score += 250;
        g.pickups.push({ x: 600, y: 300, r: 12, kind: 'essence', value: 5 });
        g.message = 'Golden gate unlocked · +250 glory';
        effect(g, 600, 260, 140, 'nova', 0, '#f5cd74');
      }
    } else if (!mechanism.unlocked) mechanism.charge = Math.max(0, mechanism.charge - dt * .08);
  }

  for (const enemy of g.enemies) {
    if (enemy.hp <= 0) continue;
    const p = nearestActor(g, enemy);
    if (!p) continue;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    const d = distance(p, enemy);
    const a = Math.atan2(p.y - enemy.y, p.x - enemy.x);
    const ranged = enemy.type === 'archer';
    let chase = ranged && d < 190 ? -.65 : ranged && d < 330 ? 0 : 1;
    const strafe = ranged && d < 340 ? Math.sin(g.time + enemy.phase) * .45 : 0;
    const beforeX = enemy.x, beforeY = enemy.y;
    move(g, enemy, (Math.cos(a) * chase - Math.sin(a) * strafe) * enemy.speed * dt, (Math.sin(a) * chase + Math.cos(a) * strafe) * enemy.speed * dt);
    // Slide around pillars rather than becoming permanently stuck behind them.
    if (chase && Math.hypot(enemy.x - beforeX, enemy.y - beforeY) < enemy.speed * dt * .2)
      move(g, enemy, -Math.sin(a) * enemy.speed * dt, Math.cos(a) * enemy.speed * dt);
    if (ranged && d < 580 && enemy.attackCooldown <= 0) {
      enemy.attackCooldown = 2 + random(g) * .6;
      g.projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(a) * 255, vy: Math.sin(a) * 255, r: 7, life: 3, team: 'enemy', kind: 'hostile', damage: 12, color: '#dc8bbf', ownerId: enemy.id });
    } else if (d < p.r + enemy.r + 5 && enemy.attackCooldown <= 0) {
      enemy.attackCooldown = .9;
      withActor(g, p, () => damagePlayer(g, enemy.type === 'brute' ? 18 : enemy.type === 'wisp' ? 7 : 11, enemy));
    }
  }

  for (const bullet of g.projectiles) {
    bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt;
    if (bullet.life <= 0) continue;
    if (bullet.x < 15 || bullet.y < 15 || bullet.x > g.width - 15 || bullet.y > g.height - 15 || !pointClear(g, bullet.x, bullet.y, bullet.r)) { bullet.life = 0; continue; }
    if (bullet.team === 'enemy') {
      const hitPlayer = actors(g).find(p => p.hp > 0 && p.jumpTime <= 0 && distance(bullet, p) < p.r + bullet.r);
      if (hitPlayer) { withActor(g, hitPlayer, () => damagePlayer(g, bullet.damage, bullet, 'projectile')); bullet.life = 0; }
    } else {
      const hit = g.enemies.find(e => e.hp > 0 && !bullet.hitIds?.includes(e.id) && distance(bullet, e) < e.r + bullet.r);
      if (hit) {
        const owner = actors(g).find(p => p.id === bullet.ownerId) || g.player;
        withActor(g, owner, () => {
          hitEnemy(g, hit, bullet.damage, 4);
          if (bullet.kind === 'orb') {
            for (const e of g.enemies) if (e !== hit && e.hp > 0 && distance(bullet, e) < 85 + e.r) hitEnemy(g, e, bullet.damage * .7);
            effect(g, bullet.x, bullet.y, 85, 'hit');
          }
        });
        if (bullet.pierce > 1) { bullet.pierce--; bullet.hitIds.push(hit.id); }
        else bullet.life = 0;
      }
    }
  }
  for (const hazard of g.hazards) {
    hazard.active = (g.time + hazard.phase) % 7 > 4.8;
    if (hazard.active) for (const p of livingActors(g)) if (distance(hazard, p) < hazard.r + p.r) withActor(g, p, () => damagePlayer(g, 9));
  }
  for (const item of g.pickups) {
    const p = nearestActor(g, item);
    if (!p) continue;
    const d = distance(item, p);
    if (d < 105 && d > 1) {
      const step = Math.min(d, 250 * dt);
      item.x += (p.x - item.x) / d * step; item.y += (p.y - item.y) / d * step;
    }
    if (d < p.r + item.r + 8) {
      if (item.kind === 'health') { p.hp = Math.min(p.maxHp, p.hp + item.value); withActor(g, p, () => effect(g, p.x, p.y, 35, 'heal', 0, '#82e4ab')); }
      else if (item.kind === 'energy') p.energy = Math.min(p.maxEnergy, p.energy + item.value);
      else if (item.kind === 'relic') { g.relics += item.value; g.score += 20; }
      else { g.essence += item.value; g.score += 10; }
      item.collected = true;
    }
  }
  for (const particle of g.particles) {
    particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.life -= dt;
    particle.vx *= .97; particle.vy *= .97;
  }
  for (const vfx of g.effects) vfx.life -= dt;
  g.enemies = g.enemies.filter(e => e.hp > 0);
  g.projectiles = g.projectiles.filter(b => b.life > 0);
  g.pickups = g.pickups.filter(i => !i.collected);
  g.particles = g.particles.filter(i => i.life > 0);
  g.effects = g.effects.filter(i => i.life > 0);
  updateContract(g);
  if (livingActors(g).length === 0) { finish(g, 'lost', g.coop ? 'The team has fallen. Heaven needs your wings again.' : 'Your wings rest. Heaven needs you again.'); return g; }
  if (g.mode === 'relic' && g.relics >= MODES.relic.target) finish(g, 'won', 'All sacred relics recovered. Heaven is protected.');
  else if (g.mode === 'trial' && g.score >= MODES.trial.target) finish(g, 'won', 'Solar Trial complete. Your legend rises.');
  else if (g.mode === 'trial' && g.time >= 90) finish(g, 'lost', 'The trial has ended. Return stronger.');
  else if (g.enemies.length === 0) {
    if (g.wave >= MODES.survival.target && g.mode === 'survival') finish(g, 'won', 'The final breach is sealed. Heaven stands.');
    else {
      if (g.waveTimer < 0) {
        g.waveTimer = 2.5; g.message = 'Breach sealed · gather essence before the next wave';
        for (const p of livingActors(g)) p.hp = Math.min(p.maxHp, p.hp + 10);
      }
      g.waveTimer -= dt;
      if (g.waveTimer <= 0) spawnWave(g);
    }
  }
  return g;
}
