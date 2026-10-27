import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, updateGame, createCoopGame, updateCoopGame, CLASSES, MODES, CONTRACTS } from '../public/arena/core.mjs';

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
