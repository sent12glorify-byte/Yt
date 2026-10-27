// Deterministic, DOM-free simulation shared by the browser and Node tests.
export const CLASSES = {
  guardian: { name: 'Dawn Guardian', weapon: 'Celestial blade', special: 'Wingburst', color: '#f5cd74', hp: 135, speed: 240 },
  sunbow: { name: 'Sunbow Ranger', weapon: 'Solar arrows', special: 'Seven suns', color: '#74e5d9', hp: 100, speed: 270 },
  stormcaller: { name: 'Storm Oracle', weapon: 'Storm orbs', special: 'Heavenfall', color: '#b4a0ff', hp: 110, speed: 245 },
  marksman: { name: 'Horizon Marksman', weapon: 'Celestial rifle', special: 'Sunpiercer', color: '#8dd4ff', hp: 105, speed: 250 },
  brawler: { name: 'Dawn Pugilist', weapon: 'Hand-to-hand combos', special: 'Judgment strike', color: '#ffb58f', hp: 150, speed: 265 },
  creator: { name: 'The Creator', weapon: 'Divine light', special: 'Let there be light', color: '#fff3c4', hp: 9999, speed: 320 },
};
export const FORMS = {
  light: { name: 'Light', color: '#fff3c4', speed: 320, damage: 150, radius: 180 },
  water: { name: 'Water', color: '#74dfff', speed: 370, damage: 140, radius: 200 },
  fire: { name: 'Fire', color: '#ff8751', speed: 300, damage: 190, radius: 180 },
  gold: { name: 'Liquid Gold', color: '#ffd467', speed: 270, damage: 200, radius: 180 },
  hero: { name: 'Superhero', color: '#9faeff', speed: 410, damage: 260, radius: 180 },
  smoke: { name: 'Smoke', color: '#bfc6d8', speed: 430, damage: 110, radius: 180 },
  cloud: { name: 'Cloud', color: '#e5f5ff', speed: 350, damage: 130, radius: 220 },
  mimic: { name: 'Borrowed Appearance', color: '#d8cbff', speed: 320, damage: 150, radius: 180 },
};
export function getForm(player = {}) {
  const custom = player.form === 'custom' && player.customForm;
  const material = custom ? player.customForm.material : Object.hasOwn(FORMS, player.form) ? player.form : 'light';
  const base = FORMS[material] || FORMS.light;
  return { ...base, ...(custom ? player.customForm : {}), material, scale: player.scale || 1 };
}
export const WEAPONS = {
  blade: { name: 'Celestial Blade' }, bow: { name: 'Solar Bow' }, staff: { name: 'Storm Staff' },
  rifle: { name: 'Horizon Rifle' }, fists: { name: 'Sacred Fists' }, dual: { name: 'Twin Blades' },
};
export const OUTFITS = {
  royal: { name: 'Royal Regalia' }, battle: { name: 'Battle Armor' }, traveler: { name: 'Traveler' },
  stealth: { name: 'Shadow Suit' }, space: { name: 'Star Suit' }, robe: { name: 'Celestial Robe' },
};
export const MODES = {
  survival: { name: 'Gatekeeper', description: 'Protect the gates through five waves.', target: 5 },
  relic: { name: 'Relic Run', description: 'Recover twelve sacred relics from the shades.', target: 12 },
  trial: { name: 'Solar Trial', description: 'Earn 1,000 glory before ninety seconds expire.', target: 1000 },
  ctf: { name: 'Capture the Flag', description: 'Return the opposing flag while yours is home. First to three captures wins.', target: 3 },
  ffa: { name: 'Free for All', description: 'Every angel for themselves. First to ten defeats or the two-minute leader wins.', target: 10 },
  warzone: { name: 'Team Warzone', description: 'Control the central circle. First team to thirty points wins.', target: 30 },
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
const competitiveMode = mode => ['ctf', 'ffa', 'warzone'].includes(mode);
const defaultWeapon = classId => ({ guardian: 'blade', sunbow: 'bow', stormcaller: 'staff', marksman: 'rifle', brawler: 'fists', creator: 'blade' })[classId];
const hexColor = (value, fallback) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
const actors = g => [...(g.players || [g.player]), ...(g.echoes || [])];
const livingActors = g => actors(g).filter(p => p.hp > 0);
const opponents = (g, owner, target) => owner !== target && (owner.isEcho ? owner.ownerId : owner.id) !== (target.isEcho ? target.ownerId : target.id) && (g.mode === 'ffa' || owner.team !== target.team);
const combatTargets = (g, owner = g.player) => g.competitive ? actors(g).filter(p => p.hp > 0 && opponents(g, owner, p)) : g.enemies;
function nearestActor(g, point, visibleOnly = false) {
  let nearest, nearestDistance = Infinity;
  for (const player of actors(g)) {
    const d = distance(player, point);
    if (player.hp > 0 && (!visibleOnly || !player.invisible) && d < nearestDistance) { nearest = player; nearestDistance = d; }
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
  const phase = (actor.classId || g.classId) === 'creator' && getForm(actor).material === 'smoke';
  const x = clamp(actor.x + dx, 28 + actor.r, g.width - 28 - actor.r);
  if (phase || pointClear(g, x, actor.y, actor.r)) actor.x = x;
  const y = clamp(actor.y + dy, 28 + actor.r, g.height - 28 - actor.r);
  if (phase || pointClear(g, actor.x, y, actor.r)) actor.y = y;
}
function particles(g, x, y, color, count = 8) {
  for (let i = 0; i < count && g.particles.length < 500; i++) {
    const a = random(g) * TAU, speed = 40 + random(g) * 145;
    const life = .22 + random(g) * .45;
    g.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life, maxLife: life, color, size: 2 + random(g) * 3 });
  }
}
function effect(g, x, y, r, kind, facing = 0, color = g.classId === 'creator' ? getForm(g.player).color : CLASSES[g.classId].color) {
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
function createBaseGame(options = {}) {
  const classId = Object.hasOwn(CLASSES, options.classId) ? options.classId : 'guardian';
  const mode = Object.hasOwn(MODES, options.mode) ? options.mode : 'survival';
  const realm = Object.hasOwn(REALMS, options.realm) ? options.realm : 'citadel';
  const contractId = Object.hasOwn(CONTRACTS, options.contractId) ? options.contractId : 'hunter';
  const upgrades = Object.fromEntries(['vigor', 'power', 'focus'].map(k => [k, upgradeLevel(options.upgrades?.[k])]));
  const maxHp = CLASSES[classId].hp + upgrades.vigor * 20;
  const maxEnergy = 100 + upgrades.focus * 15;
  const weaponId = Object.hasOwn(WEAPONS, options.weaponId) ? options.weaponId : defaultWeapon(classId);
  const columns = realm === 'fields' ? [] : realm === 'sands' ? [[245, 215], [895, 525], [535, 115], [635, 615]] : [[270, 205], [870, 205], [270, 545], [870, 545]];
  const g = { width: 1200, height: 800, classId, mode, realm, upgrades, seed: (Number(options.seed) || 1) >>> 0, fillBots: options.fillBots !== false,
    player: { id: 'player-1', name: 'Your Angel', x: 600, y: 440, r: 17, hp: maxHp, maxHp, energy: maxEnergy, maxEnergy, facing: -Math.PI / 2,
      attackCooldown: 0, dashCooldown: 0, specialCooldown: 0, dashTime: 0, dashX: 0, dashY: 0, invulnerable: 1.5, hitFlash: 0,
      crouching: false, blocking: false, aiming: false, jumpTime: 0, jumpCooldown: 0, jumpHeld: false,
      ammo: weaponId === 'rifle' ? 5 : 0, maxAmmo: weaponId === 'rifle' ? 5 : 0, reloadTime: 0, combo: 0, comboTime: 0, interactHeld: false,
      form: classId === 'creator' ? 'light' : null, morphHeld: false, formCooldown: 0, mimicHeld: false, disguise: null,
      customForm: null, scale: 1, invisible: false, invisibleHeld: false, cloneHeld: false, mergeHeld: false,
      classId, upgrades: { ...upgrades }, weaponId, outfit: Object.hasOwn(OUTFITS, options.outfit) ? options.outfit : 'royal',
      primaryColor: hexColor(options.primaryColor, CLASSES[classId].color), accentColor: hexColor(options.accentColor, '#f5cd74') },
    enemies: [], projectiles: [], particles: [], effects: [], pickups: [], echoes: [], echoesCreated: 0,
    obstacles: columns.map(([x, y]) => ({ x, y, w: 60, h: 60 })),
    hazards: realm === 'citadel' || realm === 'fields' ? [] : [{ x: 470, y: 340, r: 52, active: false, phase: 0 }, { x: 730, y: 460, r: 52, active: false, phase: 3 }],
    wave: 0, score: 0, kills: 0, essence: 0, relics: 0, time: 0, status: 'playing', message: 'The gates are yours to defend.', waveTimer: -1,
    mechanism: { levers: [{ x: 230, y: 620, on: false }, { x: 970, y: 620, on: false }], charge: 0, angle: 0, unlocked: false },
    contract: { id: contractId, progress: 0, target: CONTRACTS[contractId].target, completed: false }, nextId: 1, reward: 0, damageTaken: 0,
  };
  if (!competitiveMode(mode)) spawnWave(g);
  return g;
}
export function createGame(options = {}) {
  const g = createBaseGame(options);
  if (competitiveMode(g.mode)) {
    g.player.id = 'player-1'; g.player.name = String(options.name || 'Your Angel').slice(0, 32);
    g.players = [g.player];
    initializeCompetition(g);
  }
  return g;
}
export function createCoopGame(options = {}, roster = []) {
  if (!Array.isArray(roster) || roster.length > 8) throw new RangeError('A cooperative roster must contain at most eight players.');
  if (roster.length === 0) roster = [{ ...options, id: 'player-1', name: options.name || 'Angel' }];
  const ids = new Set();
  for (const entry of roster) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id)) throw new TypeError('Each cooperative player needs a unique nonempty string id.');
    ids.add(entry.id);
  }
  const g = createBaseGame({ ...options, ...Object.fromEntries(Object.entries(roster[0]).filter(([, value]) => value !== undefined)), classId: roster[0].classId || options.classId, upgrades: roster[0].upgrades || options.upgrades });
  g.players = roster.map((entry, index) => {
    const source = index === 0 ? g : createBaseGame({ ...options, ...entry, classId: entry.classId, upgrades: entry.upgrades });
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
  if (competitiveMode(g.mode)) initializeCompetition(g);
  return g;
}

function spawnPlayer(g, player, index = actors(g).indexOf(player)) {
  if (g.mode === 'ffa') {
    const positions = [[140, 130], [1060, 670], [1060, 130], [140, 670], [600, 100], [600, 700], [100, 400], [1100, 400]];
    [player.x, player.y] = positions[index % positions.length];
  } else {
    player.x = player.team === 'sun' ? 155 : 1045;
    player.y = clamp(280 + Math.floor(index / 2) * 160, 120, 680);
  }
  player.hp = player.maxHp; player.energy = player.maxEnergy; player.ammo = player.maxAmmo;
  player.respawnTime = 0; player.invulnerable = 1.25; player.reloadTime = 0;
  player.attackCooldown = 0; player.specialCooldown = 0; player.dashTime = 0; player.dashCooldown = 0;
  player.jumpTime = 0; player.jumpCooldown = 0; player.blocking = false; player.crouching = false;
}
function initializeCompetition(g) {
  g.competitive = true; g.coop = false;
  g.enemies = []; g.wave = 0; g.waveTimer = -1;
  const botClasses = ['guardian', 'sunbow', 'stormcaller', 'marksman', 'brawler'];
  let botNumber = 1;
  while (g.fillBots && g.players.length < 4) {
    while (g.players.some(p => p.id === `bot-${botNumber}`)) botNumber++;
    const source = createBaseGame({ mode: g.mode, realm: g.realm, classId: botClasses[(botNumber - 1) % botClasses.length] });
    g.players.push({ ...source.player, id: `bot-${botNumber}`, name: `Arena Bot ${botNumber}`, bot: true });
    botNumber++;
  }
  g.players.forEach((player, index) => {
    player.bot = Boolean(player.bot); player.team = g.mode === 'ffa' ? player.id : index % 2 === 0 ? 'sun' : 'moon';
    player.kills = 0; player.deaths = 0; player.captures = 0; player.respawnTime = 0;
    spawnPlayer(g, player, index);
  });
  g.teamScores = { sun: 0, moon: 0 }; g.matchTime = 120; g.winner = null;
  g.flags = [{ team: 'sun', x: 100, y: 400, homeX: 100, homeY: 400, carrierId: null, returnTime: 0 },
    { team: 'moon', x: 1100, y: 400, homeX: 1100, homeY: 400, carrierId: null, returnTime: 0 }];
  g.zone = { x: 600, y: 400, r: 120, owner: null, progress: 0 };
  g.message = g.fillBots ? `${MODES[g.mode].name} · ${g.players.filter(p => p.bot).length} labeled practice bots · two-minute match` : `${MODES[g.mode].name} · ${g.players.length} human players · two-minute match`;
}
function dropFlag(g, player) {
  for (const flag of g.flags || []) if (flag.carrierId === player.id) {
    flag.carrierId = null; flag.x = player.x; flag.y = player.y; flag.returnTime = 15;
  }
}
function registerDefeat(g, victim, source) {
  victim.deaths++; victim.respawnTime = 3;
  dropFlag(g, victim);
  let killer = actors(g).find(p => p.id === (source?.creditOwnerId || source?.ownerId || source?.id));
  if (killer?.isEcho) killer = actors(g).find(p => p.id === killer.ownerId);
  if (killer && opponents(g, killer, victim)) {
    killer.kills++; g.kills++; g.score += 100;
    g.message = `${killer.name} defeated ${victim.name}`;
  }
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
  p.invulnerable = g.competitive ? .2 : .6;
  p.hitFlash = .18;
  g.damageTaken += amount;
  particles(g, p.x, p.y, '#ff8a9a', 10);
  if (g.competitive && p.hp <= 0) registerDefeat(g, p, source);
}
function hitEnemy(g, e, damage, knockback = 0, emitParticles = true, projectileSource = null) {
  if (e.hp <= 0) return;
  if (g.competitive && actors(g).includes(e)) {
    const owner = g.player;
    if (!opponents(g, owner, e)) return;
    const before = e.hp;
    withActor(g, e, () => damagePlayer(g, damage, projectileSource || owner, projectileSource ? 'projectile' : 'contact'));
    if (e.hp < before && knockback) {
      const a = Math.atan2(e.y - owner.y, e.x - owner.x);
      move(g, e, Math.cos(a) * knockback, Math.sin(a) * knockback);
    }
    return;
  }
  e.hp -= damage;
  e.hitFlash = .12;
  if (knockback) {
    const a = Math.atan2(e.y - g.player.y, e.x - g.player.x);
    move(g, e, Math.cos(a) * knockback, Math.sin(a) * knockback);
  }
  if (emitParticles || e.hp <= 0) particles(g, e.x, e.y, g.classId === 'creator' ? getForm(g.player).color : CLASSES[g.classId].color, e.hp <= 0 ? 14 : 4);
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
  const bullet = { x: p.x + Math.cos(angle) * (p.r + 5), y: p.y + Math.sin(angle) * (p.r + 5), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    r: (kind === 'orb' ? 9 : 5) * (p.scale || 1), life: 1.7 + offset, team: 'player', kind, damage, color: g.classId === 'creator' ? getForm(p).color : CLASSES[g.classId].color,
    ownerId: p.id || null, creditOwnerId: p.isEcho ? p.ownerId : p.id };
  g.projectiles.push(bullet);
  return bullet;
}
function reload(g) {
  const p = g.player;
  if (p.weaponId === 'rifle' && p.ammo < p.maxAmmo && p.reloadTime <= 0) p.reloadTime = 1.8;
}
function attack(g) {
  const p = g.player;
  if (p.attackCooldown > 0 || p.reloadTime > 0 || p.blocking) return;
  const weapon = p.weaponId || defaultWeapon(g.classId);
  const scale = p.scale || 1;
  const power = (1 + g.upgrades.power * .14) * scale * (g.classId === 'creator' && weapon !== 'blade' ? getForm(p).damage / 43 : 1);
  if (g.classId === 'creator' && weapon === 'blade') {
    const form = getForm(p);
    p.attackCooldown = .3;
    effect(g, p.x, p.y, form.radius * scale, 'nova');
    for (const enemy of combatTargets(g)) if (distance(p, enemy) < form.radius * scale + enemy.r) hitEnemy(g, enemy, form.damage * power, 30);
  } else if (weapon === 'blade' || weapon === 'dual') {
    p.attackCooldown = weapon === 'dual' ? .18 : .34;
    const radius = (weapon === 'dual' ? 95 : 105) * scale;
    effect(g, p.x, p.y, radius, 'slash', p.facing);
    for (const enemy of combatTargets(g)) {
      const a = Math.atan2(enemy.y - p.y, enemy.x - p.x);
      if (distance(p, enemy) < radius + enemy.r && Math.abs(angleDelta(a, p.facing)) < 1.22) hitEnemy(g, enemy, (weapon === 'dual' ? 25 : 43) * power, weapon === 'dual' ? 8 : 14);
    }
  } else if (weapon === 'fists') {
    p.combo = p.combo % 3 + 1;
    p.comboTime = .8;
    p.attackCooldown = p.combo === 3 ? .34 : .19;
    effect(g, p.x, p.y, 70 * scale, 'punch', p.facing);
    for (const enemy of combatTargets(g)) {
      const a = Math.atan2(enemy.y - p.y, enemy.x - p.x);
      if (distance(p, enemy) < 70 * scale + enemy.r && Math.abs(angleDelta(a, p.facing)) < 1.15)
        hitEnemy(g, enemy, (p.combo === 3 ? 45 : 24) * power, p.combo === 3 ? 42 : 9);
    }
  } else if (weapon === 'rifle') {
    if (p.ammo <= 0) { reload(g); return; }
    p.ammo--;
    p.attackCooldown = .8;
    const spread = p.aiming ? 0 : (random(g) - .5) * .12;
    projectile(g, p.facing + spread, (p.aiming ? 104 : 72) * power, 'rifle', 900);
    effect(g, p.x + Math.cos(p.facing) * 35, p.y + Math.sin(p.facing) * 35, 16, 'muzzle', p.facing);
  } else if (weapon === 'bow') {
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
    for (const enemy of combatTargets(g)) hitEnemy(g, enemy, Math.max(15000, enemy.hp));
    g.projectiles = g.projectiles.filter(b => g.competitive ? !actors(g).some(owner => owner.id === b.ownerId && opponents(g, p, owner)) : b.team !== 'enemy');
    effect(g, p.x, p.y, 1300, 'nova');
    particles(g, p.x, p.y, getForm(p).color, 50);
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
    for (const e of combatTargets(g)) if (distance(p, e) < radius + e.r) hitEnemy(g, e, damage * power, g.classId === 'brawler' ? 60 : 34);
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

function canonicalCustomForm(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.name !== 'string' || !['light', 'water', 'fire', 'gold', 'hero', 'smoke', 'cloud'].includes(input.material)) return null;
  const name = input.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
  if (!name) return null;
  const scale = Number.isFinite(Number(input.scale)) ? clamp(Number(input.scale), .6, 1.8) : 1;
  return { name, material: input.material, color: hexColor(input.color, FORMS[input.material].color), scale };
}
function fitActor(g, player) {
  player.x = clamp(player.x, 28 + player.r, g.width - 28 - player.r);
  player.y = clamp(player.y, 28 + player.r, g.height - 28 - player.r);
  if ((player.classId === 'creator' && getForm(player).material === 'smoke') || pointClear(g, player.x, player.y, player.r)) return;
  for (let radius = 10; radius <= 200; radius += 10) for (let n = 0; n < 8; n++) {
    const x = clamp(player.x + Math.cos(n * TAU / 8) * radius, 28 + player.r, g.width - 28 - player.r);
    const y = clamp(player.y + Math.sin(n * TAU / 8) * radius, 28 + player.r, g.height - 28 - player.r);
    if (pointClear(g, x, y, player.r)) { player.x = x; player.y = y; return; }
  }
}
function setScale(g, player, scale) {
  player.scale = clamp(scale, .6, 1.8); player.r = 17 * player.scale;
  if (player.form === 'custom' && player.customForm) player.customForm = { ...player.customForm, scale: player.scale };
  fitActor(g, player);
}
function spawnEcho(g, owner) {
  g.echoesCreated++;
  const angle = g.echoesCreated * 2.4;
  const echo = { ...owner, id: `${owner.id}:echo:${g.echoesCreated}`, name: `Creator echo ${g.echoesCreated}`, ownerId: owner.id, isEcho: true,
    x: owner.x + Math.cos(angle) * 65, y: owner.y + Math.sin(angle) * 65, hp: owner.maxHp, energy: owner.maxEnergy,
    upgrades: { ...owner.upgrades }, customForm: owner.customForm ? { ...owner.customForm } : null, disguise: owner.disguise ? { ...owner.disguise } : null,
    invisible: false, cloneHeld: false, mergeHeld: false, invisibleHeld: false, attackCooldown: 0, specialCooldown: 0,
    bot: true, kills: 0, deaths: 0, respawnTime: 0 };
  fitActor(g, echo);
  if (g.echoes.length >= 12) g.echoes.shift();
  g.echoes.push(echo);
  effect(g, echo.x, echo.y, 65, 'morph');
  particles(g, echo.x, echo.y, getForm(owner).color, 18);
  g.message = `Creator echo ${g.echoesCreated} formed · ${g.echoes.length} / 12 active`;
}
function updatePlayer(g, dt, input) {
  const p = g.player;
  if (g.classId === 'creator' && !p.isEcho) {
    if (input.customForm) {
      const custom = canonicalCustomForm(input.customForm);
      if (custom && (p.form !== 'custom' || JSON.stringify(custom) !== JSON.stringify(p.customForm))) {
        p.customForm = custom; p.form = 'custom'; p.disguise = null;
        setScale(g, p, custom.scale);
        effect(g, p.x, p.y, 75 * p.scale, 'morph', p.facing, custom.color);
        particles(g, p.x, p.y, custom.color, 28);
        g.message = `Custom material form · ${custom.name}`;
      } else if (!custom) g.message = 'Choose a name and one of the seven supported materials.';
    }
    if (input.invisible && !p.invisibleHeld) {
      p.invisible = !p.invisible;
      g.message = p.invisible ? 'Invisible · enemies cannot track your body' : 'Visible · your body returns';
    }
    if (input.clone && !p.cloneHeld) spawnEcho(g, p);
    if (input.merge && !p.mergeHeld) {
      const nearby = g.echoes.filter(echo => echo.ownerId === p.id && distance(echo, p) <= 160);
      if (nearby.length) {
        g.echoes = g.echoes.filter(echo => !nearby.includes(echo));
        setScale(g, p, p.scale + nearby.length * .12);
        effect(g, p.x, p.y, 95 * p.scale, 'morph');
        particles(g, p.x, p.y, getForm(p).color, 28);
        g.message = `${nearby.length} echoes merged · body scale ${p.scale.toFixed(2)}×`;
      } else g.message = 'Move within 160 units of your own echoes to merge.';
    }
  }
  p.cloneHeld = Boolean(input.clone); p.invisibleHeld = Boolean(input.invisible); p.mergeHeld = Boolean(input.merge);
  p.formCooldown = Math.max(0, p.formCooldown - dt);
  if (g.classId === 'creator' && input.morph && !p.morphHeld && p.formCooldown <= 0) {
    const forms = Object.keys(FORMS).filter(form => form !== 'mimic');
    p.form = forms[(forms.indexOf(p.form) + 1) % forms.length];
    p.disguise = null;
    fitActor(g, p);
    p.formCooldown = .3;
    effect(g, p.x, p.y, 75, 'morph');
    particles(g, p.x, p.y, getForm(p).color, 28);
    g.message = `Creator form · ${getForm(p).name}`;
  }
  p.morphHeld = Boolean(input.morph);
  if (g.classId === 'creator' && input.mimic && !p.mimicHeld && p.formCooldown <= 0) {
    const target = livingActors(g).filter(actor => actor !== p).sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (target) {
      p.form = 'mimic'; p.formCooldown = .3;
      p.disguise = Object.fromEntries(['classId', 'weaponId', 'outfit', 'primaryColor', 'accentColor', 'team', 'name'].map(key => [key, target[key]]));
      effect(g, p.x, p.y, 75, 'morph', p.facing, target.primaryColor);
      particles(g, p.x, p.y, target.primaryColor, 28);
      g.message = `Borrowed appearance · ${target.name} · your identity and team stay unchanged`;
    } else g.message = 'No other living character is available to imitate.';
  }
  p.mimicHeld = Boolean(input.mimic);
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
    p.dashCooldown = g.classId === 'creator' && getForm(p).material === 'hero' ? .8 : Math.max(1.4, 2.2 - g.upgrades.focus * .15);
    p.invulnerable = .3;
    effect(g, p.x, p.y, 32, 'dash');
  }
  if (p.dashTime > 0) {
    move(g, p, p.dashX * 760 * dt, p.dashY * 760 * dt);
    p.dashTime -= dt;
    particles(g, p.x, p.y, CLASSES[g.classId].color, 2);
  } else {
    const stance = (p.crouching ? .55 : 1) * (p.blocking ? .5 : 1) * (p.aiming && p.weaponId === 'rifle' ? .55 : 1);
    const speed = g.classId === 'creator' ? getForm(p).speed : CLASSES[g.classId].speed;
    move(g, p, mx * speed * stance * dt, my * speed * stance * dt);
  }
  if (input.attack) attack(g);
  if (input.special) special(g);
}

export function updateGame(g, dt, input = {}) {
  const controlledPlayer = g.player;
  return updateWorld(g, dt, player => player === controlledPlayer ? input : {});
}
export function updateCoopGame(g, dt, inputsById = {}) {
  return updateWorld(g, dt, player => inputsById[player.id] || {});
}
function updateWorld(g, dt, inputFor) {
  if (g.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return g;
  dt = Math.min(dt, .05);
  g.time += dt;
  g.echoes = (g.echoes || []).filter(echo => echo.hp > 0);
  if (g.competitive) for (const player of g.players) if (player.hp <= 0) {
    dropFlag(g, player);
    player.respawnTime = Math.max(0, (player.respawnTime || 3) - dt);
    if (player.respawnTime <= 0) spawnPlayer(g, player);
  }
  for (const player of actors(g)) if (player.hp > 0 && (!player.isEcho || g.echoes.includes(player))) withActor(g, player, () => updatePlayer(g, dt, player.isEcho ? echoInput(g, player) : g.competitive && player.bot ? botInput(g, player) : inputFor(player)));
  for (const player of livingActors(g)) if ((player.classId || g.classId) === 'creator' && getForm(player).material === 'fire') {
    withActor(g, player, () => {
      for (const enemy of combatTargets(g)) if (enemy.hp > 0 && distance(player, enemy) < 100 + enemy.r) hitEnemy(g, enemy, 50 * dt, 0, false);
    });
  }
  for (const player of livingActors(g)) if ((player.classId || g.classId) === 'creator' && getForm(player).material === 'cloud') {
    for (const ally of livingActors(g)) if (ally !== player && (!g.competitive || !opponents(g, player, ally)) && distance(player, ally) <= 200)
      ally.hp = Math.min(ally.maxHp, ally.hp + dt * 2);
  }
  if (g.mechanism) {
    const mechanism = g.mechanism;
    if (mechanism.levers.every(lever => lever.on)) {
      const goldPower = livingActors(g).some(player => (player.classId || g.classId) === 'creator' && getForm(player).material === 'gold' && distance(player, { x: 600, y: 400 }) <= 160);
      mechanism.charge = Math.min(1, mechanism.charge + dt * .25 * (goldPower ? 2 : 1));
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
    const p = nearestActor(g, enemy, true);
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
      const owner = actors(g).find(p => p.id === bullet.ownerId) || actors(g).find(p => p.id === bullet.creditOwnerId) || g.player;
      const hit = combatTargets(g, owner).find(e => e.hp > 0 && (!g.competitive || e.jumpTime <= 0) && !bullet.hitIds?.includes(e.id) && distance(bullet, e) < e.r + bullet.r);
      if (hit) {
        withActor(g, owner, () => {
          hitEnemy(g, hit, bullet.damage, 4, true, bullet);
          if (bullet.kind === 'orb') {
            for (const e of combatTargets(g)) if (e !== hit && e.hp > 0 && distance(bullet, e) < 85 + e.r) hitEnemy(g, e, bullet.damage * .7, 0, true, bullet);
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
  if (g.competitive) { updateCompetition(g, dt); return g; }
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

function botInput(g, player) {
  const targets = combatTargets(g, player).filter(target => !target.invisible);
  const enemy = targets.sort((a, b) => distance(a, player) - distance(b, player))[0];
  let destination = enemy || { x: 600, y: 400 };
  if (g.mode === 'warzone') destination = g.zone;
  if (g.mode === 'ctf') {
    const own = g.flags.find(flag => flag.team === player.team);
    const enemyFlag = g.flags.find(flag => flag.team !== player.team);
    if (enemyFlag.carrierId === player.id) destination = { x: own.homeX, y: own.homeY };
    else if (own.carrierId) destination = actors(g).find(p => p.id === own.carrierId) || own;
    else if (distance(own, { x: own.homeX, y: own.homeY }) > 1) destination = own;
    else if (!enemyFlag.carrierId) destination = enemyFlag;
  }
  const melee = ['blade', 'dual', 'fists'].includes(player.weaponId);
  const d = distance(destination, player);
  const a = Math.atan2(destination.y - player.y, destination.x - player.x);
  const enemyDistance = enemy ? distance(enemy, player) : Infinity;
  let forward = d > (destination === enemy ? melee ? 65 : 240 : 24) ? 1 : 0;
  if (destination === enemy && !melee && d < 150) forward = -.7;
  let moveX = Math.cos(a) * forward, moveY = Math.sin(a) * forward;
  if (forward && !pointClear(g, player.x + moveX * 45, player.y + moveY * 45, player.r)) {
    const obstacle = g.obstacles.find(o => player.x + moveX * 45 + player.r > o.x && player.x + moveX * 45 - player.r < o.x + o.w && player.y + moveY * 45 + player.r > o.y && player.y + moveY * 45 - player.r < o.y + o.h);
    if (obstacle) {
      if (Math.abs(moveX) >= Math.abs(moveY)) moveY = player.y < obstacle.y + obstacle.h / 2 ? -1 : 1;
      else moveX = player.x < obstacle.x + obstacle.w / 2 ? -1 : 1;
    }
  }
  return { moveX, moveY, aimX: enemy?.x ?? destination.x, aimY: enemy?.y ?? destination.y,
    attack: enemyDistance < (melee ? 125 : 720), special: enemyDistance < 180,
    dash: d > 420 && (g.mode === 'ctf' || enemyDistance < 120),
    aim: player.weaponId === 'rifle' && enemyDistance > 280, reload: player.weaponId === 'rifle' && player.ammo === 0 };
}
function resetFlag(flag) {
  flag.x = flag.homeX; flag.y = flag.homeY; flag.carrierId = null; flag.returnTime = 0;
}
function flagHome(flag) { return !flag.carrierId && distance(flag, { x: flag.homeX, y: flag.homeY }) < 1; }
function updateFlags(g, dt) {
  for (const flag of g.flags) {
    if (flag.carrierId) {
      const carrier = actors(g).find(player => player.id === flag.carrierId);
      if (carrier?.hp > 0) { flag.x = carrier.x; flag.y = carrier.y; }
      else { flag.carrierId = null; flag.returnTime = 15; }
    } else {
      if (!flagHome(flag)) {
        flag.returnTime = Math.max(0, (flag.returnTime || 15) - dt);
        if (flag.returnTime <= 0) resetFlag(flag);
      }
      for (const player of livingActors(g).filter(actor => !actor.isEcho)) if (distance(player, flag) < 32) {
        if (player.team === flag.team) { if (!flagHome(flag)) resetFlag(flag); }
        else if (!g.flags.some(other => other.carrierId === player.id)) {
          flag.carrierId = player.id; flag.returnTime = 0;
          g.message = `${player.name} took the ${flag.team} flag`;
          break;
        }
      }
    }
  }
  for (const flag of g.flags) if (flag.carrierId) {
    const carrier = actors(g).find(player => player.id === flag.carrierId);
    const own = g.flags.find(other => other.team === carrier?.team);
    if (carrier?.hp > 0 && own && flagHome(own) && distance(carrier, { x: own.homeX, y: own.homeY }) < 42) {
      g.teamScores[carrier.team]++; carrier.captures++; g.score += 200;
      g.message = `${carrier.name} captured the flag · ${g.teamScores[carrier.team]} / 3`;
      resetFlag(flag);
    }
  }
}
function updateCompetition(g, dt) {
  g.matchTime = Math.max(0, g.matchTime - dt);
  if (g.mode === 'ctf') updateFlags(g, dt);
  if (g.mode === 'warzone') {
    const teams = [...new Set(livingActors(g).filter(player => !player.isEcho && distance(player, g.zone) <= g.zone.r).map(player => player.team))];
    const owner = teams.length === 1 ? teams[0] : teams.length > 1 ? 'contested' : null;
    if (owner !== g.zone.owner) g.zone.progress = 0;
    g.zone.owner = owner;
    if (teams.length === 1) {
      g.zone.progress += dt;
      if (g.zone.progress >= 1) {
        const points = Math.floor(g.zone.progress);
        g.zone.progress -= points; g.teamScores[owner] += points; g.score += points * 10;
      }
    }
  }
  let winner = null;
  if (g.mode === 'ffa') {
    const sorted = [...g.players].sort((a, b) => b.kills - a.kills);
    if (sorted[0].kills >= MODES.ffa.target || g.matchTime <= 0) winner = sorted[0].kills === sorted[1]?.kills ? 'draw' : sorted[0].id;
  } else {
    if (g.teamScores.sun >= MODES[g.mode].target || g.teamScores.moon >= MODES[g.mode].target || g.matchTime <= 0)
      winner = g.teamScores.sun === g.teamScores.moon ? 'draw' : g.teamScores.sun > g.teamScores.moon ? 'sun' : 'moon';
  }
  if (winner) {
    g.winner = winner;
    const won = g.mode === 'ffa' ? winner === g.players[0].id : winner === g.players[0].team;
    finish(g, won ? 'won' : 'lost', winner === 'draw' ? 'Match drawn · the next legend is yours to write' : `${g.mode === 'ffa' ? actors(g).find(p => p.id === winner)?.name || winner : winner === 'sun' ? 'Sun team' : 'Moon team'} wins ${MODES[g.mode].name}`);
  }
}

function echoInput(g, echo) {
  const owner = actors(g).find(player => player.id === echo.ownerId && !player.isEcho);
  const enemy = [...combatTargets(g, echo)].filter(target => target.hp > 0 && !target.invisible).sort((a, b) => distance(a, echo) - distance(b, echo))[0];
  const enemyDistance = enemy ? distance(enemy, echo) : Infinity;
  const melee = ['blade', 'dual', 'fists'].includes(echo.weaponId);
  const engage = enemyDistance < 650;
  const destination = engage ? enemy : owner || { x: 600, y: 400 };
  const d = distance(destination, echo);
  const stop = engage ? melee ? Math.min(100, getForm(echo).radius * echo.scale * .65) : 230 : 85;
  const direction = d > stop ? 1 : engage && !melee && d < 130 ? -.6 : 0;
  let moveX = d > 0 ? (destination.x - echo.x) / d * direction : 0;
  let moveY = d > 0 ? (destination.y - echo.y) / d * direction : 0;
  if (direction && getForm(echo).material !== 'smoke' && !pointClear(g, echo.x + moveX * 40, echo.y + moveY * 40, echo.r)) {
    const oldX = moveX; moveX = -moveY || .5; moveY = oldX || .5;
  }
  return { moveX, moveY, aimX: engage ? enemy.x : destination.x, aimY: engage ? enemy.y : destination.y,
    attack: enemyDistance < (melee ? getForm(echo).radius * echo.scale + 20 : 650),
    aim: echo.weaponId === 'rifle' && enemyDistance > 280, reload: echo.weaponId === 'rifle' && echo.ammo === 0 };
}
