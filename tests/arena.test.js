import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame, createCoopGame, updateCoopGame, getForm, CLASSES, FORMS, MODES, CONTRACTS, WEAPONS, OUTFITS, CHARACTERS, HAIR_STYLES, BODY_TYPES, characterAppearance } from '../public/arena/core.mjs';

const quiet = options => { const g = createGame(options); g.enemies = []; g.waveTimer = 1000; return g; };
const step = (g, seconds, input = {}) => { for (let t = 0; t < seconds; t += .025) updateGame(g, .025, input); };
function foe(x, y, hp = 100) { return { id: 500, x, y, hp, maxHp: hp, r: 18, type: 'shade', speed: 0, attackCooldown: 100, hitFlash: 0, phase: 0 }; }

test('seeded simulation, defaults, and bounded permanent upgrades are deterministic', () => {
  assert.deepEqual(createGame({ seed: 123 }), createGame({ seed: 123 }));
  const g = createGame({ classId: 'missing', upgrades: { vigor: 999, power: -2, focus: NaN } });
  assert.equal(g.classId, 'guardian');
  assert.equal(g.player.maxHp, CLASSES.guardian.hp + 60);
  assert.deepEqual(g.upgrades, { vigor: 3, power: 0, focus: 0 });
  assert.equal(g.enemies.length, 5);
});

test('movement normalizes diagonals and respects world bounds and pillar collision', () => {
  const straight = quiet(), diagonal = quiet();
  const origin = { ...straight.player };
  updateGame(straight, .05, { moveX: 1 });
  updateGame(diagonal, .05, { moveX: 1, moveY: 1 });
  assert.ok(Math.abs(Math.hypot(straight.player.x - origin.x, straight.player.y - origin.y) - Math.hypot(diagonal.player.x - origin.x, diagonal.player.y - origin.y)) < 1e-8);
  straight.player.x = 50; straight.player.y = 450;
  step(straight, 1, { moveX: -1 });
  assert.equal(straight.player.x, 45);
  straight.player.x = 240; straight.player.y = 230;
  step(straight, 1, { moveX: 1 });
  assert.ok(straight.player.x + straight.player.r <= 270);
});

test('guardian attacks an aimed arc, respects cooldown, and applies upgraded damage', () => {
  const g = quiet({ upgrades: { power: 1 } });
  g.enemies = [foe(660, 440), foe(540, 440)];
  updateGame(g, .01, { attack: true, aimX: 900, aimY: 440 });
  assert.ok(Math.abs(g.enemies[0].hp - (100 - 43 * 1.14)) < 1e-8);
  assert.equal(g.enemies[1].hp, 100);
  const hp = g.enemies[0].hp;
  updateGame(g, .01, { attack: true, aimX: 900, aimY: 440 });
  assert.equal(g.enemies[0].hp, hp);
});

test('ranged classes fire real projectiles that damage targets; oracle splash hits neighbors', () => {
  for (const classId of ['sunbow', 'stormcaller']) {
    const g = quiet({ classId });
    g.enemies = [foe(750, 440), foe(750, 490)];
    updateGame(g, .01, { attack: true, aimX: 900, aimY: 440 });
    assert.equal(g.projectiles.length, 1);
    step(g, .4);
    assert.ok(g.enemies[0].hp < 100);
    assert.equal(g.enemies[1].hp < 100, classId === 'stormcaller');
  }
});

test('dash grants temporary protection and consumes a cooldown; specials consume energy once', () => {
  const g = quiet();
  g.player.invulnerable = 0;
  g.enemies = [foe(610, 440)]; g.enemies[0].attackCooldown = 0;
  const initialHp = g.player.hp;
  updateGame(g, .01, { dash: true, moveX: 1, special: true });
  assert.equal(g.player.hp, initialHp);
  assert.ok(g.player.dashCooldown > 2);
  assert.ok(g.player.invulnerable > 0);
  assert.equal(g.player.energy, 70);
  updateGame(g, .01, { dash: true, special: true });
  assert.ok(g.player.energy < 71 && g.player.energy > 70);
  assert.ok(g.player.specialCooldown > 5);
});

test('kills drop collectible essence and update contracts, then a loss pays exactly once', () => {
  const g = quiet({ contractId: 'hunter' });
  g.kills = CONTRACTS.hunter.target - 1;
  g.enemies = [foe(650, 440, 20)];
  updateGame(g, .01, { attack: true, aimX: 900, aimY: 440 });
  assert.equal(g.kills, 15); assert.equal(g.contract.completed, true);
  assert.ok(g.pickups.some(p => p.kind === 'essence'));
  step(g, .5);
  assert.equal(g.essence, 1);
  g.player.hp = 0;
  updateGame(g, .01);
  assert.equal(g.status, 'lost'); assert.ok(g.reward >= 50);
  const reward = g.reward, time = g.time;
  updateGame(g, 1, { attack: true });
  assert.equal(g.reward, reward); assert.equal(g.time, time);
});

test('each mode has an achievable win and the trial has a genuine timeout', () => {
  const survival = quiet(); survival.wave = MODES.survival.target;
  updateGame(survival, .01); assert.equal(survival.status, 'won');
  const relic = quiet({ mode: 'relic' });
  relic.relics = 11;
  relic.pickups.push({ x: relic.player.x, y: relic.player.y, r: 10, kind: 'relic', value: 1 });
  updateGame(relic, .01); assert.equal(relic.status, 'won'); assert.equal(relic.relics, 12);
  const trial = quiet({ mode: 'trial' }); trial.score = MODES.trial.target;
  updateGame(trial, .01); assert.equal(trial.status, 'won');
  const expired = quiet({ mode: 'trial' }); expired.time = 89.99;
  updateGame(expired, .025); assert.equal(expired.status, 'lost');
});

test('ranged enemies attack, damage is real, and inactive/final states remain finite', () => {
  const g = quiet(); g.player.invulnerable = 0;
  g.enemies = [{ ...foe(800, 440), type: 'archer', attackCooldown: 0 }];
  updateGame(g, .01); assert.ok(g.projectiles.some(b => b.team === 'enemy'));
  step(g, .8); assert.ok(g.player.hp < g.player.maxHp);
  const before = g.time;
  updateGame(g, NaN); updateGame(g, -1);
  assert.equal(g.time, before);
  step(g, 3, { moveX: Infinity, moveY: NaN, aimX: Infinity });
  assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.y));
});

test('all combat classes can complete a seeded five-wave mission using real controls', () => {
  for (const classId of Object.keys(CLASSES)) {
    const g = createGame({ classId, seed: 11 });
    for (let frame = 0; frame < 14400 && g.status === 'playing'; frame++) {
      const p = g.player;
      const enemy = [...g.enemies].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      let moveX = 0, moveY = 0;
      if (enemy) {
        const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        const a = Math.atan2(enemy.y - p.y, enemy.x - p.x);
        const melee = classId === 'guardian' || classId === 'brawler' || classId === 'creator';
        const pursuit = melee ? (d > (classId === 'brawler' ? 50 : 75) ? 1 : 0) : d < 210 ? -1 : d > 310 ? 1 : 0;
        moveX = Math.cos(a) * pursuit - Math.sin(a) * .3;
        moveY = Math.sin(a) * pursuit + Math.cos(a) * .3;
      } else if (g.pickups.length) {
        const target = g.pickups[0], d = Math.hypot(target.x - p.x, target.y - p.y) || 1;
        moveX = (target.x - p.x) / d; moveY = (target.y - p.y) / d;
      }
      const nearby = g.enemies.filter(e => Math.hypot(e.x - p.x, e.y - p.y) < (classId === 'sunbow' ? 500 : 300)).length;
      const distanceToEnemy = enemy ? Math.hypot(enemy.x - p.x, enemy.y - p.y) : Infinity;
      updateGame(g, 1 / 60, { moveX, moveY, aimX: enemy?.x ?? p.x + 1, aimY: enemy?.y ?? p.y, attack: !!enemy, special: nearby >= 3,
        aim: classId === 'marksman' && distanceToEnemy > 300, dash: classId === 'marksman' && distanceToEnemy < 140 });
    }
    assert.equal(g.status, 'won', classId);
    assert.equal(g.wave, 5);
    assert.ok(g.kills > 0 && g.player.hp > 0, classId);
  }
});

test('marksman has real magazine/reload gating and aiming improves damage while slowing movement', () => {
  const hip = quiet({ classId: 'marksman' }), aimed = quiet({ classId: 'marksman' });
  updateGame(hip, .01, { attack: true, moveX: 1, aimX: 1000, aimY: 440 });
  updateGame(aimed, .01, { attack: true, moveX: 1, aimX: 1000, aimY: 440, aim: true });
  assert.equal(hip.player.ammo, 4); assert.equal(aimed.player.ammo, 4);
  assert.ok(aimed.projectiles[0].damage > hip.projectiles[0].damage);
  assert.equal(aimed.projectiles[0].vy, 0);
  assert.ok(aimed.player.x - 600 < hip.player.x - 600);
  updateGame(aimed, .01, { reload: true });
  assert.equal(aimed.player.reloadTime, 1.8);
  const count = aimed.projectiles.length;
  updateGame(aimed, .05, { attack: true });
  assert.equal(aimed.projectiles.length, count);
  step(aimed, 1.8);
  assert.equal(aimed.player.reloadTime, 0); assert.equal(aimed.player.ammo, 5);
});

test('brawler performs a timed three-hit hand-to-hand combo with a stronger finisher', () => {
  const g = quiet({ classId: 'brawler' });
  g.enemies = [foe(650, 440, 200)];
  for (let n = 1; n <= 3; n++) {
    updateGame(g, .01, { attack: true, aimX: 1000, aimY: 440 });
    assert.equal(g.player.combo, n);
    if (n < 3) step(g, .2);
  }
  assert.equal(g.enemies[0].hp, 200 - 24 - 24 - 45);
  assert.ok(g.enemies[0].x > 700);
  step(g, .9); assert.equal(g.player.combo, 0);
});

function incoming(g, vx = -100) {
  g.player.invulnerable = 0;
  g.projectiles.push({ x: g.player.x + (vx < 0 ? 10 : -10), y: g.player.y, vx, vy: 0, r: 7, life: 2, team: 'enemy', kind: 'hostile', damage: 10 });
}
test('crouch reduces bullet damage and movement; frontal blocking spends energy and protects', () => {
  const normal = quiet(), crouch = quiet(), block = quiet(), rear = quiet();
  for (const g of [normal, crouch, block, rear]) g.player.facing = 0;
  incoming(normal); incoming(crouch); incoming(block); incoming(rear, 100);
  updateGame(normal, .01, { moveY: 1 });
  updateGame(crouch, .01, { moveY: 1, crouch: true });
  updateGame(block, .01, { moveY: 1, block: true });
  updateGame(rear, .01, { block: true });
  assert.equal(normal.player.maxHp - normal.player.hp, 10);
  assert.equal(crouch.player.maxHp - crouch.player.hp, 6);
  assert.equal(block.player.maxHp - block.player.hp, 3);
  assert.equal(rear.player.maxHp - rear.player.hp, 10);
  assert.ok(block.player.energy < 100);
  assert.ok(crouch.player.y < normal.player.y);
  assert.ok(block.player.y < crouch.player.y);
});

test('jump avoids real hostile projectiles and held jump cannot repeat after landing', () => {
  const g = quiet(); incoming(g);
  updateGame(g, .01, { jump: true });
  assert.equal(g.player.hp, g.player.maxHp);
  assert.equal(g.player.jumpTime, .45);
  assert.equal(g.player.jumpCooldown, 2);
  step(g, 2.1, { jump: true });
  assert.equal(g.player.jumpTime, 0);
  updateGame(g, .01, { jump: false });
  updateGame(g, .01, { jump: true });
  assert.equal(g.player.jumpTime, .45);
});

test('cooperative actors move and use distinct classes while the world advances exactly once', () => {
  const g = createCoopGame({ seed: 10 }, [
    { id: 'host', name: 'Host', classId: 'marksman', upgrades: { vigor: 1 } },
    { id: 'friend', name: 'Friend', classId: 'brawler' },
  ]);
  g.enemies = []; g.waveTimer = 1000;
  const [host, friend] = g.players;
  assert.equal(g.player, host); assert.equal(host.maxHp, CLASSES.marksman.hp + 20);
  const startHost = host.x, startFriend = friend.y;
  updateCoopGame(g, .05, {
    host: { moveX: 1, attack: true, aimX: 1000, aimY: host.y },
    friend: { moveY: 1, attack: true, aimX: 1000, aimY: friend.y },
  });
  assert.equal(g.time, .05);
  assert.equal(host.x - startHost, CLASSES.marksman.speed * .05);
  assert.equal(friend.y - startFriend, CLASSES.brawler.speed * .05);
  assert.equal(host.ammo, 4); assert.equal(friend.combo, 1);
  assert.equal(g.projectiles[0].ownerId, 'host');
  assert.ok(Math.abs(g.projectiles[0].life - 1.65) < 1e-8);
  assert.ok(g.effects.some(effect => effect.kind === 'punch' && effect.ownerId === 'friend'));
  assert.equal(g.classId, 'marksman'); assert.equal(g.player, host);
});

test('enemies can damage both teammates and a fallen host does not end the team match', () => {
  const g = createCoopGame({}, [{ id: 'one', classId: 'guardian' }, { id: 'two', classId: 'sunbow' }]);
  const [one, two] = g.players;
  one.x = 400; one.y = 440; two.x = 800; two.y = 440;
  one.invulnerable = 0; two.invulnerable = 0;
  g.enemies = [{ ...foe(420, 440), attackCooldown: 0 }, { ...foe(820, 440), id: 501, attackCooldown: 0 }];
  updateCoopGame(g, .01);
  assert.equal(one.maxHp - one.hp, 11); assert.equal(two.maxHp - two.hp, 11);
  one.hp = 0;
  const fallenX = one.x;
  updateCoopGame(g, .01, { one: { moveX: 1, attack: true } });
  assert.equal(g.status, 'playing'); assert.equal(one.x, fallenX);
  g.pickups.push({ x: two.x, y: two.y, kind: 'essence', r: 8, value: 1 });
  updateCoopGame(g, .01);
  assert.equal(g.essence, 1);
  two.hp = 0;
  updateCoopGame(g, .01);
  assert.equal(g.status, 'lost');
});

test('a living teammate can finish the shared mission and cooperative snapshots serialize', () => {
  const g = createCoopGame({}, [{ id: 'one', classId: 'guardian' }, { id: 'two', classId: 'stormcaller' }]);
  g.player.hp = 0; g.enemies = []; g.wave = 5;
  updateCoopGame(g, .01);
  assert.equal(g.status, 'won'); assert.ok(g.reward > 0);
  const snapshot = JSON.parse(JSON.stringify(g));
  assert.equal(snapshot.players.length, 2); assert.equal(snapshot.player.id, 'one');
  assert.equal(snapshot.players[1].classId, 'stormcaller');
  assert.throws(() => createCoopGame({}, [{ id: 'same' }, { id: 'same' }]), /unique/);
});

test('the Creator is invincible to melee, projectiles, and hazards and fields stay open', () => {
  const g = quiet({ classId: 'creator', realm: 'fields' });
  assert.equal(g.obstacles.length, 0); assert.equal(g.hazards.length, 0);
  g.player.invulnerable = 0;
  g.enemies = [{ ...foe(g.player.x + 10, g.player.y, 100000), attackCooldown: 0 }];
  incoming(g);
  g.hazards.push({ x: g.player.x, y: g.player.y, r: 100, phase: 5 });
  updateGame(g, .01);
  assert.equal(g.player.hp, g.player.maxHp); assert.equal(g.damageTaken, 0);
  const before = g.enemies[0].hp;
  updateGame(g, .01, { attack: true });
  assert.ok(g.enemies[0].hp <= before - 150);
  g.player.energy = 0;
  updateGame(g, .01, { special: true });
  assert.equal(g.enemies.length, 0); assert.equal(g.player.energy, g.player.maxEnergy);
  assert.equal(g.player.specialCooldown, 1.5);
});

test('nearby lever interactions engage golden pulleys, unlock after four seconds, and reward once', () => {
  const g = quiet({ realm: 'fields' });
  updateGame(g, .01, { interact: true });
  assert.deepEqual(g.mechanism.levers.map(lever => lever.on), [false, false]);
  updateGame(g, .01, { interact: false });
  g.player.x = 230; g.player.y = 620;
  updateGame(g, .01, { interact: true });
  updateGame(g, .01, { interact: true });
  assert.equal(g.mechanism.levers[0].on, true);
  updateGame(g, .01, { interact: false });
  g.player.x = 970;
  updateGame(g, .01, { interact: true });
  assert.deepEqual(g.mechanism.levers.map(lever => lever.on), [true, true]);
  step(g, 4.1);
  assert.equal(g.mechanism.unlocked, true); assert.equal(g.mechanism.charge, 1);
  assert.ok(g.mechanism.angle > 0);
  assert.equal(g.score, 250);
  assert.equal(g.pickups.filter(item => item.kind === 'essence' && item.value === 5).length, 1);
  step(g, 5);
  assert.equal(g.score, 250);
  assert.equal(g.pickups.filter(item => item.kind === 'essence' && item.value === 5).length, 1);
});

test('cooperative pulley charging advances once per world tick and loses charge when disengaged', () => {
  const g = createCoopGame({ realm: 'fields' }, [{ id: 'left' }, { id: 'right' }]);
  g.enemies = []; g.waveTimer = 1000;
  g.players[0].x = 230; g.players[0].y = 620;
  g.players[1].x = 970; g.players[1].y = 620;
  updateCoopGame(g, .05, { left: { interact: true }, right: { interact: true } });
  assert.deepEqual(g.mechanism.levers.map(lever => lever.on), [true, true]);
  assert.equal(g.mechanism.charge, .05 * .25);
  updateCoopGame(g, .05, {});
  const charged = g.mechanism.charge;
  updateCoopGame(g, .05, { right: { interact: true } });
  assert.equal(g.mechanism.levers[1].on, false);
  assert.ok(Math.abs(g.mechanism.charge - (charged - .05 * .08)) < 1e-8);
});

test('the Creator cycles its real forms with edge-triggered morphing and keeps divine protection', () => {
  const g = quiet({ classId: 'creator', realm: 'fields' });
  assert.equal(g.player.form, 'light');
  for (const expected of ['water', 'fire', 'gold', 'hero', 'smoke', 'cloud', 'light']) {
    updateGame(g, .01, { morph: true });
    assert.equal(g.player.form, expected);
    assert.equal(g.player.formCooldown, .3);
    step(g, .4, { morph: true });
    assert.equal(g.player.form, expected, 'holding morph must not repeatedly change form');
    incoming(g);
    updateGame(g, .01, { block: true });
    assert.equal(g.player.hp, g.player.maxHp);
    assert.equal(g.player.energy, g.player.maxEnergy);
  }
  const guest = quiet({ classId: 'guardian' });
  updateGame(guest, .01, { morph: true });
  assert.equal(guest.player.form, null);
});

test('water and superhero forms alter real movement and superhero dash recovers faster', () => {
  for (const form of ['water', 'hero']) {
    const g = quiet({ classId: 'creator', realm: 'fields' });
    g.player.form = form;
    updateGame(g, .05, { moveX: 1 });
    assert.equal(g.player.x - 600, FORMS[form].speed * .05);
    if (form === 'hero') {
      updateGame(g, .01, { dash: true, moveX: 1 });
      assert.equal(g.player.dashCooldown, .8);
    }
  }
});

test('liquid gold doubles pulley charge only near the wheel and fire burns once per world step', () => {
  const gold = quiet({ classId: 'creator', realm: 'fields' });
  gold.player.form = 'gold';
  gold.mechanism.levers.forEach(lever => { lever.on = true; });
  updateGame(gold, .05);
  assert.equal(gold.mechanism.charge, .05 * .5);
  gold.player.x = 100; gold.player.y = 100;
  const initialCharge = gold.mechanism.charge;
  updateGame(gold, .05);
  assert.ok(Math.abs(gold.mechanism.charge - initialCharge - .05 * .25) < 1e-8);

  const fire = createCoopGame({ realm: 'fields' }, [{ id: 'god', classId: 'creator' }, { id: 'friend', classId: 'guardian' }]);
  fire.player.form = 'fire';
  fire.enemies = [foe(fire.player.x + 60, fire.player.y, 1000)];
  for (let n = 0; n < 20; n++) updateCoopGame(fire, .05);
  assert.equal(fire.enemies[0].hp, 950);
  assert.equal(fire.time > .99 && fire.time < 1.01, true);
});

function competitive(mode, roster = [
  { id: 'one', classId: 'guardian' },
  { id: 'two', classId: 'guardian' },
  { id: 'three', classId: 'guardian' },
]) {
  const g = createCoopGame({ mode, realm: 'fields', seed: 17 }, roster);
  for (const [i, player] of g.players.entries()) {
    player.bot = false;
    player.invulnerable = 0;
    player.x = 1000 + (i % 2) * 70;
    player.y = 100 + Math.floor(i / 2) * 70;
  }
  return g;
}
function coopFrames(g, count, input = {}) {
  for (let i = 0; i < count; i++) updateCoopGame(g, .05, input);
}

test('competitive modes create four actors with bots, real objectives, and no enemy waves', () => {
  for (const mode of ['ctf', 'ffa', 'warzone']) {
    const g = createGame({ mode, realm: 'fields', classId: 'guardian' });
    assert.equal(g.players.length, 4, mode);
    assert.equal(g.player, g.players[0]);
    assert.equal(g.players.filter(player => player.bot).length, 3);
    assert.equal(g.enemies.length, 0);
    assert.equal(g.matchTime, 120);
    const before = g.players.filter(player => player.bot).map(player => ({ x: player.x, y: player.y }));
    updateGame(g, .05);
    const after = g.players.filter(player => player.bot);
    assert.ok(after.some((player, i) => Math.hypot(player.x - before[i].x, player.y - before[i].y) > 0), mode);
    assert.equal(g.enemies.length, 0);
  }
});

test('competitive melee hurts an opposing team while protecting nearby teammates', () => {
  const g = competitive('warzone');
  const [attacker, target, friend] = g.players;
  attacker.x = 400; attacker.y = 400;
  target.x = 450; target.y = 410;
  friend.x = 450; friend.y = 390;
  assert.equal(attacker.team, friend.team);
  assert.notEqual(attacker.team, target.team);
  const targetHp = target.hp, friendlyHp = friend.hp;
  updateCoopGame(g, .01, { one: { attack: true, aimX: 1000, aimY: 400 } });
  assert.ok(target.hp < targetHp);
  assert.equal(friend.hp, friendlyHp);
});

test('competitive projectiles pass teammates and hit opponents with their real weapon damage', () => {
  const g = competitive('warzone', [
    { id: 'one', classId: 'guardian', weaponId: 'bow' },
    { id: 'two', classId: 'guardian' },
    { id: 'three', classId: 'guardian' },
  ]);
  const [attacker, target, friend] = g.players;
  attacker.x = 400; attacker.y = 400;
  friend.x = 550; friend.y = 400;
  target.x = 700; target.y = 400;
  const targetHp = target.hp, friendlyHp = friend.hp;
  updateCoopGame(g, .01, { one: { attack: true, aimX: 1000, aimY: 400 } });
  assert.ok(g.projectiles.some(projectile => projectile.ownerId === 'one'));
  coopFrames(g, 12);
  assert.ok(target.hp < targetHp);
  assert.equal(friend.hp, friendlyHp);
});

test('competitive defeats credit the attacker, respawn after three seconds, and finish at ten FFA kills', () => {
  const g = competitive('ffa');
  const [attacker, target] = g.players;
  attacker.x = 400; attacker.y = 400;
  target.x = 450; target.y = 400; target.hp = 1;
  updateCoopGame(g, .01, { one: { attack: true, aimX: 1000, aimY: 400 } });
  assert.equal(attacker.kills, 1); assert.equal(target.deaths, 1);
  assert.equal(target.hp, 0); assert.ok(target.respawnTime > 2.9);
  assert.equal(g.status, 'playing');
  coopFrames(g, 40);
  assert.equal(target.hp, 0);
  coopFrames(g, 25);
  assert.equal(target.hp, target.maxHp);
  attacker.kills = 9; attacker.attackCooldown = 0;
  attacker.x = 400; attacker.y = 400;
  target.x = 450; target.y = 400; target.hp = 1; target.invulnerable = 0;
  updateCoopGame(g, .01, { one: { attack: true, aimX: 1000, aimY: 400 } });
  assert.equal(attacker.kills, 10); assert.equal(g.winner, attacker.id);
  assert.equal(g.status, 'won');
});

test('capture the flag carries an enemy flag home, requires the home flag, and wins at three captures', () => {
  const g = competitive('ctf');
  const runner = g.players[0];
  const own = g.flags.find(flag => flag.team === runner.team);
  const enemy = g.flags.find(flag => flag.team !== runner.team);
  for (let capture = 1; capture <= 3; capture++) {
    runner.x = enemy.homeX; runner.y = enemy.homeY;
    updateCoopGame(g, .01);
    assert.equal(enemy.carrierId, runner.id);
    runner.x = own.homeX; runner.y = own.homeY;
    if (capture === 1) {
      own.x = own.homeX + 150;
      updateCoopGame(g, .01);
      assert.equal(g.teamScores[runner.team], 0, 'a capture must wait for the home flag');
      own.x = own.homeX;
    }
    updateCoopGame(g, .01);
    assert.equal(g.teamScores[runner.team], capture);
    assert.equal(enemy.carrierId, null);
    assert.equal(enemy.x, enemy.homeX); assert.equal(enemy.y, enemy.homeY);
  }
  assert.equal(g.winner, runner.team); assert.equal(g.status, 'won');
});

test('defeating a flag carrier drops the flag at its position instead of returning or duplicating it', () => {
  const g = competitive('ctf');
  const [carrier, attacker] = g.players;
  const flag = g.flags.find(flag => flag.team !== carrier.team);
  carrier.x = flag.homeX; carrier.y = flag.homeY;
  updateCoopGame(g, .01);
  assert.equal(flag.carrierId, carrier.id);
  carrier.x = 600; carrier.y = 400; carrier.hp = 1;
  attacker.x = 550; attacker.y = 400;
  updateCoopGame(g, .01, { two: { attack: true, aimX: 1000, aimY: 400 } });
  assert.equal(carrier.hp, 0); assert.equal(flag.carrierId, null);
  assert.ok(Math.hypot(flag.x - 600, flag.y - 400) < 100);
  assert.notEqual(flag.x, flag.homeX);
});

test('warzone scores an uncontested central capture but neither team scores while contested', () => {
  const g = competitive('warzone');
  const [sun, moon] = g.players;
  sun.x = 600; sun.y = 400;
  coopFrames(g, 24);
  assert.ok(g.teamScores.sun >= 1);
  assert.equal(g.zone.owner, 'sun');
  moon.x = 620; moon.y = 400;
  const before = { ...g.teamScores };
  coopFrames(g, 30);
  assert.deepEqual(g.teamScores, before);
  moon.x = 1100; moon.y = 700;
  g.teamScores.sun = 29;
  coopFrames(g, 24);
  assert.equal(g.winner, 'sun'); assert.equal(g.status, 'won');
});

test('competitive time limits settle the actual score leader instead of treating every player as a winner', () => {
  const g = competitive('warzone');
  g.teamScores.sun = 1; g.teamScores.moon = 4; g.matchTime = .01;
  updateCoopGame(g, .025);
  assert.equal(g.winner, 'moon'); assert.equal(g.status, 'lost');
  const ffa = competitive('ffa');
  ffa.players[1].kills = 3; ffa.matchTime = .01;
  updateCoopGame(ffa, .025);
  assert.equal(ffa.winner, ffa.players[1].id); assert.equal(ffa.status, 'lost');
});

test('outfits and weapon choices are bounded and rifle loadouts change basic attacks outside the marksman class', () => {
  assert.deepEqual(Object.keys(WEAPONS).sort(), ['blade', 'bow', 'dual', 'fists', 'rifle', 'staff']);
  for (const outfit of ['royal', 'battle', 'traveler', 'stealth', 'space', 'robe']) assert.ok(OUTFITS[outfit].name);
  const invalid = createGame({ classId: 'guardian', weaponId: 'unknown', outfit: '<script>', primaryColor: 'url(secret)', accentColor: '#fff' });
  assert.equal(invalid.player.weaponId, 'blade');
  assert.equal(invalid.player.outfit, 'royal');
  assert.equal(invalid.player.primaryColor, CLASSES.guardian.color);
  assert.equal(invalid.player.accentColor, '#f5cd74');
  const rifle = quiet({ classId: 'guardian', weaponId: 'rifle', outfit: 'space', primaryColor: '#112233', accentColor: '#aabbcc' });
  assert.equal(rifle.player.weaponId, 'rifle'); assert.equal(rifle.player.outfit, 'space');
  assert.equal(rifle.player.primaryColor, '#112233'); assert.equal(rifle.player.accentColor, '#aabbcc');
  updateGame(rifle, .01, { attack: true, aimX: 1000, aimY: 440 });
  assert.equal(rifle.player.ammo, 4);
  assert.ok(rifle.projectiles.some(projectile => projectile.kind === 'rifle'));
});

test('smoke phases through pillars while respecting arena bounds', () => {
  const g = quiet({ classId: 'creator', realm: 'citadel' });
  g.player.x = 240; g.player.y = 230;
  updateGame(g, .05, { moveX: 1 });
  assert.ok(g.player.x + g.player.r <= 270);
  g.player.form = 'smoke';
  for (let n = 0; n < 6; n++) updateGame(g, .05, { moveX: 1 });
  assert.ok(g.player.x > 330);
  for (let n = 0; n < 100; n++) updateGame(g, .05, { moveX: -1 });
  assert.equal(g.player.x, 45);
});

test('cloud heals nearby teammates while leaving opposing players unchanged', () => {
  const g = competitive('warzone', [{ id: 'god', classId: 'creator' }, { id: 'enemy', classId: 'guardian' }, { id: 'ally', classId: 'guardian' }]);
  const [god, enemy, ally] = g.players;
  god.form = 'cloud'; god.x = 600; god.y = 400;
  enemy.x = 500; enemy.y = 400; enemy.hp = 50;
  ally.x = 700; ally.y = 400; ally.hp = 50;
  for (let n = 0; n < 20; n++) updateCoopGame(g, .05);
  assert.ok(Math.abs(ally.hp - 52) < 1e-8);
  assert.equal(enemy.hp, 50);
});

test('Creator imitation copies only visible appearance and keeps real identity, team, and immunity', () => {
  const g = competitive('warzone', [{ id: 'god', classId: 'creator' }, { id: 'guest', name: 'Opponent', classId: 'sunbow', outfit: 'stealth', weaponId: 'rifle', primaryColor: '#123456' }]);
  const [god, guest] = g.players;
  god.x = 600; god.y = 400; guest.x = 660; guest.y = 400;
  updateCoopGame(g, .01, { god: { mimic: true } });
  assert.equal(god.form, 'mimic');
  assert.equal(god.disguise.classId, 'sunbow'); assert.equal(god.disguise.name, 'Opponent');
  assert.equal(god.disguise.outfit, 'stealth'); assert.equal(god.disguise.weaponId, 'rifle');
  assert.equal(god.disguise.primaryColor, '#123456'); assert.equal(god.disguise.team, guest.team);
  assert.equal(god.id, 'god'); assert.equal(god.classId, 'creator'); assert.notEqual(god.team, guest.team);
  const hp = god.hp;
  updateCoopGame(g, .01, { guest: { special: true, aimX: god.x, aimY: god.y } });
  coopFrames(g, 10);
  assert.equal(god.hp, hp);
  updateCoopGame(g, .01, { god: { morph: true } });
  assert.equal(god.form, 'light'); assert.equal(god.disguise, null);
  const solo = quiet({ classId: 'creator' });
  updateGame(solo, .01, { mimic: true });
  assert.equal(solo.player.form, 'light'); assert.match(solo.message, /No other living/);
});

test('custom Creator forms validate and clamp appearance while resolving actual supported material traits', () => {
  const g = quiet({ classId: 'creator', realm: 'fields' });
  updateGame(g, .01, { customForm: { name: '  \u0000Ocean armor  ', material: 'water', color: '#123456', scale: 9, speed: 100000, damage: 100000 } });
  assert.equal(g.player.form, 'custom');
  assert.deepEqual(g.player.customForm, { name: 'Ocean armor', material: 'water', color: '#123456', scale: 1.8 });
  assert.equal(g.player.r, 17 * 1.8);
  assert.equal(getForm(g.player).speed, FORMS.water.speed);
  assert.equal(getForm(g.player).damage, FORMS.water.damage);
  updateGame(g, .01, { customForm: { name: 'Tiny sun', material: 'light', color: 'url(secret)', scale: -9 } });
  assert.equal(g.player.scale, .6); assert.equal(g.player.customForm.color, FORMS.light.color);
  updateGame(g, .01, { customForm: { name: 'Unsupported', material: 'mimic', scale: 1 } });
  assert.equal(g.player.customForm.name, 'Tiny sun');
  const guest = quiet({ classId: 'guardian' });
  updateGame(guest, .01, { customForm: { name: 'Guest override', material: 'fire', color: '#123456', scale: 1.8 }, invisible: true, clone: true });
  assert.equal(guest.player.form, null); assert.equal(guest.player.customForm, null);
  assert.equal(guest.player.invisible, false); assert.equal(guest.echoes.length, 0);
});

test('arbitrarily named forms replace one bounded active definition instead of accumulating history', () => {
  const g = quiet({ classId: 'creator', realm: 'fields' });
  for (let n = 0; n < 100; n++) updateGame(g, .01, { customForm: { name: `Created form ${n}`, material: 'gold', color: '#abcdef', scale: 1 } });
  assert.equal(g.player.customForm.name, 'Created form 99');
  assert.deepEqual(Object.keys(g.player.customForm).sort(), ['color', 'material', 'name', 'scale']);
  assert.equal(JSON.stringify(g.player).includes('Created form 0'), false);
  assert.ok(g.particles.length <= 500);
  assert.equal(g.echoes.length, 0);
});

test('invisibility redirects NPC tracking and suppresses bot attacks while preserving shared loot', () => {
  const g = createCoopGame({ realm: 'fields' }, [{ id: 'god', classId: 'creator' }, { id: 'guest', classId: 'guardian' }]);
  const [god, guest] = g.players;
  god.x = 600; god.y = 400; guest.x = 800; guest.y = 400;
  g.enemies = [{ ...foe(620, 400, 1000), speed: 100, attackCooldown: 0 }];
  g.pickups.push({ x: god.x, y: god.y, r: 8, kind: 'essence', value: 1 });
  updateCoopGame(g, .05, { god: { invisible: true } });
  assert.equal(god.invisible, true);
  assert.ok(g.enemies[0].x > 620, 'NPC should pursue the visible teammate to its right');
  assert.equal(g.essence, 1);
  updateCoopGame(g, .05, { god: { invisible: true } });
  assert.equal(god.invisible, true, 'holding the toggle does not repeatedly change visibility');

  const pvp = competitive('ffa', [{ id: 'god', classId: 'creator' }]);
  const owner = pvp.player, bot = pvp.players[1];
  owner.x = 500; owner.y = 600;
  bot.x = 500; bot.y = 400; bot.bot = true; bot.attackCooldown = 0;
  for (const other of pvp.players.slice(2)) { other.hp = 0; other.respawnTime = 3; }
  updateCoopGame(pvp, .01, { god: { invisible: true } });
  assert.equal(pvp.projectiles.length, 0);
  assert.ok(Math.abs(bot.facing) < .1, 'bot aims at its neutral destination rather than the invisible player below');
});

test('Creator echoes are independent bounded actors with input debounce and a lifetime counter', () => {
  const g = quiet({ classId: 'creator', realm: 'fields', outfit: 'space', primaryColor: '#123456' });
  updateGame(g, .01, { clone: true });
  updateGame(g, .01, { clone: true });
  assert.equal(g.echoes.length, 1); assert.equal(g.echoesCreated, 1);
  for (let n = 1; n < 20; n++) {
    updateGame(g, .01);
    updateGame(g, .01, { clone: true });
  }
  assert.equal(g.echoes.length, 12); assert.equal(g.echoesCreated, 20);
  assert.equal(new Set(g.echoes.map(echo => echo.id)).size, 12);
  assert.ok(g.echoes.every(echo => echo.isEcho && echo.ownerId === g.player.id && echo.outfit === 'space' && echo.primaryColor === '#123456'));
  assert.equal(g.players, undefined, 'echoes do not replace the human roster');
  assert.ok(g.particles.length <= 500);
});

test('echo AI actually attacks nearby enemies and follows its owner when no enemy is present', () => {
  const g = quiet({ classId: 'creator', realm: 'fields' });
  g.player.x = 200; g.player.y = 400;
  updateGame(g, .01, { clone: true });
  const echo = g.echoes[0];
  g.enemies = [foe(echo.x + 70, echo.y, 1000)];
  updateGame(g, .01);
  assert.ok(g.enemies[0].hp < 1000 && g.enemies[0].hp > 0, 'echo uses its basic attack without invoking a global purge');
  assert.equal(echo.specialCooldown, 0);
  g.enemies = [];
  g.player.x = 1000; g.player.y = 700;
  const before = Math.hypot(echo.x - g.player.x, echo.y - g.player.y);
  updateGame(g, .05);
  assert.ok(Math.hypot(echo.x - g.player.x, echo.y - g.player.y) < before);
});

test('merging consumes only nearby owned echoes and increases real body radius, damage, and reach', () => {
  const g = createCoopGame({ realm: 'fields' }, [{ id: 'owner', classId: 'creator' }, { id: 'other', classId: 'creator' }]);
  g.enemies = []; g.waveTimer = 1000;
  const [owner, other] = g.players;
  owner.x = 600; owner.y = 440; other.x = 1000; other.y = 700;
  updateCoopGame(g, .01, { owner: { clone: true }, other: { clone: true } });
  updateCoopGame(g, .01);
  updateCoopGame(g, .01, { owner: { clone: true } });
  const owned = g.echoes.filter(echo => echo.ownerId === owner.id);
  const foreign = g.echoes.find(echo => echo.ownerId === other.id);
  owned[0].x = 650; owned[0].y = 440;
  owned[1].x = 100; owned[1].y = 100;
  foreign.x = 620; foreign.y = 440;
  updateCoopGame(g, .01, { owner: { merge: true } });
  assert.equal(g.echoes.length, 2);
  assert.ok(g.echoes.includes(owned[1]) && g.echoes.includes(foreign));
  assert.ok(Math.abs(owner.scale - 1.12) < 1e-8);
  assert.equal(owner.r, 17 * owner.scale);
  const original = quiet({ classId: 'creator', realm: 'fields' });
  original.enemies = [foe(810, 440, 1000)];
  updateGame(original, .01, { attack: true });
  assert.equal(original.enemies[0].hp, 1000, 'the original body cannot reach this target');
  g.echoes = []; g.enemies = [foe(810, 440, 1000)]; owner.attackCooldown = 0;
  updateCoopGame(g, .01, { owner: { attack: true } });
  assert.ok(Math.abs(g.enemies[0].hp - (1000 - 150 * 1.12)) < 1e-8);
});

test('FFA echoes target opponents instead of owners and keep owner kill credit after replacement', () => {
  const g = competitive('ffa', [{ id: 'owner', classId: 'creator', weaponId: 'rifle' }, { id: 'target', classId: 'guardian' }]);
  const owner = g.player, target = g.players[1];
  owner.x = 650; owner.y = 400;
  updateCoopGame(g, .01, { owner: { clone: true } });
  const echo = g.echoes[0]; echo.x = 600; echo.y = 400;
  target.x = 400; target.y = 400; target.invulnerable = 0;
  updateCoopGame(g, .01);
  const bullet = g.projectiles.find(projectile => projectile.ownerId === echo.id);
  assert.ok(bullet && bullet.vx < 0, 'echo shoots the opponent to its left, never its owner to the right');
  g.echoes = [];
  coopFrames(g, 8);
  assert.equal(target.hp, 0); assert.equal(owner.kills, 1);
});

test('echoes do not carry flags, capture warzones, or enter FFA winner standings', () => {
  for (const mode of ['ctf', 'warzone', 'ffa']) {
    const g = competitive(mode, [{ id: 'owner', classId: 'creator' }]);
    updateCoopGame(g, .01, { owner: { clone: true } });
    const echo = g.echoes[0];
    echo.x = 600; echo.y = 400;
    if (mode === 'ctf') {
      const enemyFlag = g.flags.find(flag => flag.team !== echo.team);
      echo.x = enemyFlag.x; echo.y = enemyFlag.y;
      updateCoopGame(g, .01);
      assert.equal(enemyFlag.carrierId, null);
    } else if (mode === 'warzone') {
      echo.x = 600; echo.y = 400;
      coopFrames(g, 24);
      assert.deepEqual(g.teamScores, { sun: 0, moon: 0 });
    } else {
      echo.kills = 999; g.matchTime = .01;
      updateCoopGame(g, .025);
      assert.equal(g.winner, 'draw');
    }
  }
});

test('online competitive games preserve only the human roster when bot filling is disabled', () => {
  for (const mode of ['ctf', 'ffa', 'warzone']) {
    const g = createCoopGame({ mode, realm: 'fields', fillBots: false }, [
      { id: 'human-one', name: 'First player', classId: 'guardian' },
      { id: 'human-two', name: 'Second player', classId: 'sunbow' },
    ]);
    assert.deepEqual(g.players.map(player => player.id), ['human-one', 'human-two']);
    assert.equal(g.players.some(player => player.bot), false);
    assert.equal(g.enemies.length, 0); assert.equal(g.fillBots, false);
    const positions = g.players.map(player => [player.x, player.y]);
    updateCoopGame(g, .05);
    assert.deepEqual(g.players.map(player => [player.x, player.y]), positions);
    assert.equal(g.time, .05);
  }
});

test('the character roster defaults to humans and canonical appearance contains only supported visual fields', () => {
  assert.equal(Object.keys(CHARACTERS).length, 25);
  assert.deepEqual(Object.keys(HAIR_STYLES), ['short', 'long', 'braids', 'shaved', 'mohawk']);
  assert.deepEqual(Object.keys(BODY_TYPES), ['slim', 'athletic', 'broad']);
  const defaults = { characterId: 'human', characterName: '', skinTone: '#c98a62', hairStyle: 'short', hairColor: '#2b1c18', bodyType: 'athletic' };
  assert.deepEqual(characterAppearance(), defaults);
  assert.deepEqual(characterAppearance(null), defaults);
  assert.deepEqual(characterAppearance({ characterId: '__proto__', hairStyle: 'constructor', bodyType: {}, skinTone: '#123', hairColor: 'url(secret)', characterName: 25, hp: Infinity }), defaults);
  const sanitized = characterAppearance({ characterId: 'elf', characterName: '\u0000  Moon   Wanderer\u0085 ', hairStyle: 'long', skinTone: '#AABBCC', hairColor: '#112233', bodyType: 'slim', damage: 90000, classId: 'creator' });
  assert.deepEqual(sanitized, { characterId: 'elf', characterName: 'Moon Wanderer', skinTone: '#aabbcc', hairStyle: 'long', hairColor: '#112233', bodyType: 'slim' });
  assert.equal(createGame().player.characterId, 'human');
  assert.equal(createGame().player.name, 'Your Champion');
});

test('strict network appearance rejects malformed customization instead of silently admitting it', () => {
  for (const invalid of [null, [], { characterId: 'missing' }, { characterId: '__proto__' }, { hairStyle: 'url(secret)' }, { bodyType: 'giant' }, { skinTone: 'red' }, { hairColor: 123 }, { characterName: 'x'.repeat(33) }, { characterName: 'bad\u0000name' }, { characterName: {} }]) {
    assert.throws(() => characterAppearance(invalid, true), TypeError);
  }
  assert.deepEqual(characterAppearance(undefined, true), characterAppearance());
  const selected = { characterId: 'fox', characterName: 'Dune Scout', skinTone: '#DDAA77', hairStyle: 'braids', hairColor: '#332211', bodyType: 'broad' };
  assert.deepEqual(characterAppearance(selected, true), { ...selected, skinTone: '#ddaa77' });
});

test('every character archetype remains cosmetic and cannot forge combat powers or collision scale', () => {
  for (const characterId of Object.keys(CHARACTERS)) {
    const baseline = quiet({ realm: 'fields', classId: 'guardian' });
    const selected = quiet({ realm: 'fields', classId: 'guardian', characterId, bodyType: 'broad', hp: 999999, speed: 999999, damage: 999999, scale: 100 });
    assert.equal(selected.player.characterId, characterId);
    assert.equal(selected.player.hp, baseline.player.hp);
    assert.equal(selected.player.r, baseline.player.r);
    assert.equal(selected.player.scale, 1);
    for (const game of [baseline, selected]) {
      updateGame(game, .05, { moveX: 1 });
      game.enemies = [foe(game.player.x + 60, game.player.y, 1000)];
      updateGame(game, .01, { attack: true, aimX: 1000, aimY: game.player.y });
    }
    assert.equal(selected.player.x, baseline.player.x);
    assert.equal(selected.enemies[0].hp, baseline.enemies[0].hp);
    assert.equal(selected.player.energy, baseline.player.energy);
  }
});

test('co-op preserves independent character appearances and Creator disguise and echoes carry their visuals', () => {
  const ownerLook = { characterId: 'human', characterName: 'Amun', skinTone: '#6b3e26', hairStyle: 'braids', hairColor: '#111111', bodyType: 'broad' };
  const guestLook = { characterId: 'cat', characterName: 'Moon Scout', skinTone: '#e1b188', hairStyle: 'shaved', hairColor: '#ffddcc', bodyType: 'slim' };
  const g = createCoopGame({ realm: 'fields', fillBots: false }, [
    { id: 'owner', classId: 'creator', ...ownerLook },
    { id: 'guest', classId: 'guardian', ...guestLook },
  ]);
  g.enemies = []; g.waveTimer = 1000;
  const [owner, guest] = g.players;
  assert.deepEqual(characterAppearance(owner), ownerLook);
  assert.deepEqual(characterAppearance(guest), guestLook);
  updateCoopGame(g, .01, { owner: { mimic: true } });
  assert.deepEqual(characterAppearance(owner.disguise), guestLook);
  assert.deepEqual(characterAppearance(owner), ownerLook, 'disguise does not replace the owner appearance or real identity');
  assert.equal(owner.id, 'owner'); assert.equal(owner.classId, 'creator');
  updateCoopGame(g, .01, { owner: { clone: true } });
  const echo = g.echoes[0];
  assert.deepEqual(characterAppearance(echo), ownerLook);
  assert.deepEqual(characterAppearance(echo.disguise), guestLook);
  assert.notEqual(echo.disguise, owner.disguise);
  owner.disguise.characterName = 'Changed';
  assert.equal(echo.disguise.characterName, 'Moon Scout');
  assert.deepEqual(characterAppearance(guest), guestLook);
});
