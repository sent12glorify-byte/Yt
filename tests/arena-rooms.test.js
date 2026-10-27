import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { createArenaRoomsRouter } from '../arena-rooms.js';

async function fixture(t, options) {
  const router = createArenaRoomsRouter(options);
  const app = express(); app.use('/api/arena', router);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/arena`;
  t.after(async () => { router.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const call = (path, body) => fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  async function create(body = {}) {
    const response = await call('/rooms', { name: 'Amun', classId: 'guardian', ...body });
    assert.equal(response.status, 201);
    return response.json();
  }
  async function stream(session) {
    const abort = new AbortController();
    const params = new URLSearchParams({ playerId: session.playerId, token: session.token });
    const response = await fetch(`${base}/rooms/${session.roomId}/events?${params}`, { signal: abort.signal });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const reader = response.body.getReader();
    t.after(() => abort.abort());
    let buffer = '';
    return { close: () => abort.abort(), next: async (matches = () => true) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        let index;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index); buffer = buffer.slice(index + 2);
          const line = block.split('\n').find(line => line.startsWith('data: '));
          if (line) { const data = JSON.parse(line.slice(6)); if (matches(data)) return data; }
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Stream closed before the expected event.');
        buffer += new TextDecoder().decode(chunk.value);
      }
      throw new Error('Expected room event did not arrive.');
    } };
  }
  return { call, create, stream, router };
}

test('free rooms validate choices, sanitize names, expose no session tokens, and enforce capacity', async t => {
  const { call, create } = await fixture(t);
  const owner = await create({ name: '  A\u0000mun  ', realm: 'fields' });
  assert.match(owner.roomId, /^[A-HJ-NP-Z2-9]{6}$/); assert.match(owner.token, /^[a-f0-9]{64}$/);
  const initial = await (await call(`/rooms/${owner.roomId}`)).json();
  assert.equal(initial.players[0].name, 'Amun'); assert.equal(initial.capacity, 4);
  assert.equal(initial.settings.realm, 'fields');
  assert.ok(!JSON.stringify(initial).includes(owner.token));
  for (let i = 0; i < 3; i++) assert.equal((await call(`/rooms/${owner.roomId}/join`, { name: `Guest ${i}`, classId: 'sunbow' })).status, 201);
  assert.equal((await call(`/rooms/${owner.roomId}/join`, { name: 'Fifth' })).status, 409);
  for (const body of [{ name: '' }, { name: 'x'.repeat(25) }, { classId: 'invalid' }, { mode: 'invalid' }, { realm: 'invalid' }, { contractId: 'invalid' }]) {
    assert.equal((await call('/rooms', body)).status, 400);
  }
  assert.equal((await call('/rooms/invalid')).status, 400);
  assert.equal((await call('/rooms/ABCDEF')).status, 404);
});

test('room membership authenticates actions, restricts starting to the owner, and reserves Creator for owner', async t => {
  const { call, create } = await fixture(t);
  const owner = await create({ classId: 'creator', realm: 'fields' });
  assert.equal((await call(`/rooms/${owner.roomId}/join`, { name: 'Pretender', classId: 'creator' })).status, 403);
  const guest = await (await call(`/rooms/${owner.roomId}/join`, { name: 'Guest', classId: 'brawler' })).json();
  assert.equal((await call(`/rooms/${owner.roomId}/start`, guest)).status, 403);
  assert.equal((await call(`/rooms/${owner.roomId}/start`, { ...owner, token: '0'.repeat(64) })).status, 401);
  assert.equal((await call(`/rooms/${owner.roomId}/start`, owner)).status, 200);
  assert.equal((await call(`/rooms/${owner.roomId}/start`, owner)).status, 409);
  assert.equal((await call(`/rooms/${owner.roomId}/join`, { name: 'Late' })).status, 409);
  assert.equal((await call(`/rooms/${owner.roomId}/events?playerId=${guest.playerId}&token=bad`)).status, 401);
  assert.equal((await call(`/rooms/${owner.roomId}/input`, { ...guest, token: 'bad', input: {} })).status, 401);
});

test('two browsers receive real shared simulation and independent authenticated movement over SSE', async t => {
  const { call, create, stream } = await fixture(t);
  const owner = await create({ classId: 'creator', realm: 'fields' });
  const guest = await (await call(`/rooms/${owner.roomId}/join`, { name: 'Neith', classId: 'marksman' })).json();
  const first = await stream(owner), second = await stream(guest);
  const lobby = await first.next(event => event.type === 'lobby' && event.players.length === 2);
  assert.equal(lobby.hostId, owner.playerId);
  assert.ok(!JSON.stringify(lobby).includes(owner.token)); assert.ok(!JSON.stringify(lobby).includes(guest.token));
  assert.equal((await call(`/rooms/${owner.roomId}/start`, owner)).status, 200);
  const started = await first.next(event => event.type === 'state');
  const initialOwner = started.game.players.find(player => player.id === owner.playerId);
  const initialGuest = started.game.players.find(player => player.id === guest.playerId);
  assert.equal(started.game.players.length, 2);
  assert.equal(initialOwner.classId, 'creator'); assert.equal(initialGuest.classId, 'marksman');
  assert.equal((await call(`/rooms/${owner.roomId}/input`, { ...guest, input: { moveX: 1, moveY: 0, aimX: 1000, aimY: 400, attack: true, hp: 99999, classId: 'creator' } })).status, 202);
  const moved = await first.next(event => event.type === 'state' && event.game.players.find(player => player.id === guest.playerId).x > initialGuest.x + 12);
  const actor = moved.game.players.find(player => player.id === guest.playerId);
  assert.equal(actor.classId, 'marksman'); assert.equal(actor.maxHp, initialGuest.maxHp); assert.ok(actor.hp <= actor.maxHp);
  assert.equal(moved.game.players.find(player => player.id === owner.playerId).x, initialOwner.x);
  const other = await second.next(event => event.type === 'state' && event.game.time >= moved.game.time);
  assert.equal(other.game.seed, moved.game.seed);
  assert.ok(!JSON.stringify(other).includes(owner.token)); assert.ok(!JSON.stringify(other).includes(guest.token));
  assert.equal((await call(`/rooms/${owner.roomId}/input`, { ...guest, input: { moveX: 'fast' } })).status, 400);
  assert.equal((await call(`/rooms/${owner.roomId}/input`, { ...guest, input: { attack: 'yes' } })).status, 400);
  assert.equal((await call(`/rooms/${owner.roomId}/input`, { ...guest, input: [] })).status, 400);
});

test('leaving transfers lobby ownership, frees room capacity, and removes empty rooms', async t => {
  const { call, create } = await fixture(t, { maxRooms: 1 });
  const owner = await create();
  assert.equal((await call('/rooms', { name: 'Another' })).status, 503);
  const guest = await (await call(`/rooms/${owner.roomId}/join`, { name: 'Guest' })).json();
  assert.equal((await call(`/rooms/${owner.roomId}/leave`, { ...owner, token: '0'.repeat(64) })).status, 401);
  assert.equal((await call(`/rooms/${owner.roomId}/leave`, owner)).status, 200);
  const lobby = await (await call(`/rooms/${owner.roomId}`)).json();
  assert.equal(lobby.hostId, guest.playerId); assert.equal(lobby.players.length, 1);
  assert.equal((await call(`/rooms/${owner.roomId}/leave`, guest)).status, 200);
  assert.equal((await call(`/rooms/${owner.roomId}`)).status, 404);
  await create();
});

test('network input is bounded, one-shot actions expire, and stale movement stops', async t => {
  const { call, create, stream } = await fixture(t);
  const owner = await create({ classId: 'creator', realm: 'fields' });
  const events = await stream(owner);
  await call(`/rooms/${owner.roomId}/start`, owner);
  assert.equal((await call(`/rooms/${owner.roomId}/input`, { ...owner, input: { moveX: 999, moveY: -999, aimX: 1e20, aimY: -1e20, dash: true } })).status, 202);
  const dashed = await events.next(event => event.type === 'state' && event.game.time > .4);
  const actor = dashed.game.players[0];
  assert.ok(actor.x >= actor.r && actor.x <= dashed.game.width - actor.r);
  assert.ok(actor.y >= actor.r && actor.y <= dashed.game.height - actor.r);
  assert.ok(actor.dashTime <= 0); assert.ok(actor.dashCooldown > 0);
  // Move along a clear horizontal line, then let the server's one-second input lease expire.
  await call(`/rooms/${owner.roomId}/input`, { ...owner, input: { moveX: -1, moveY: 0 } });
  const stopped = await events.next(event => event.type === 'state' && event.game.time > dashed.game.time + 1.15);
  const later = await events.next(event => event.type === 'state' && event.game.time > stopped.game.time + .2);
  assert.equal(later.game.players[0].x, stopped.game.players[0].x);
  assert.equal(later.game.players[0].y, stopped.game.players[0].y);
  assert.ok(Math.abs(later.game.player.facing) <= Math.PI);
});

test('inactive rooms expire and disconnected players do not occupy rooms indefinitely', async t => {
  const { call, create } = await fixture(t, { tickMs: 10, roomTtlMs: 70, disconnectMs: 1000 });
  const owner = await create();
  await new Promise(resolve => setTimeout(resolve, 110));
  assert.equal((await call(`/rooms/${owner.roomId}`)).status, 404);
  const other = await fixture(t, { tickMs: 10, disconnectMs: 30, roomTtlMs: 1000 });
  const disconnected = await other.create();
  await new Promise(resolve => setTimeout(resolve, 70));
  assert.equal((await other.call(`/rooms/${disconnected.roomId}`)).status, 404);
});

test('loadout choices validate before room admission and cannot inject arbitrary styles', async t => {
  const { call, create } = await fixture(t);
  const owner = await create();
  for (const invalid of [
    { weaponId: 'laser' }, { weaponId: null }, { outfit: 'unknown' }, { outfit: [] },
    { primaryColor: 'red' }, { primaryColor: '#fff' }, { primaryColor: 'url(javascript:alert(1))' },
    { accentColor: '#12zz45' }, { accentColor: null },
  ]) {
    assert.equal((await call('/rooms', { name: 'Invalid owner', ...invalid })).status, 400);
    assert.equal((await call(`/rooms/${owner.roomId}/join`, { name: 'Invalid guest', ...invalid })).status, 400);
  }
  const lobby = await (await call(`/rooms/${owner.roomId}`)).json();
  assert.equal(lobby.players.length, 1, 'rejected appearance must not consume a player slot');
});

test('custom weapons, outfits, and colors survive lobby and authoritative match snapshots', async t => {
  const { call, create, stream } = await fixture(t);
  const hostAppearance = { weaponId: 'dual', outfit: 'royal', primaryColor: '#1234AB', accentColor: '#FFEEDD' };
  const guestAppearance = { weaponId: 'rifle', outfit: 'stealth', primaryColor: '#193040', accentColor: '#ABCDEF' };
  const owner = await create({ classId: 'creator', ...hostAppearance });
  const guest = await (await call(`/rooms/${owner.roomId}/join`, { name: 'Traveler', classId: 'guardian', ...guestAppearance })).json();
  const lobby = await (await call(`/rooms/${owner.roomId}`)).json();
  assert.equal(lobby.players.find(player => player.id === owner.playerId).primaryColor, '#1234ab');
  assert.equal(lobby.players.find(player => player.id === guest.playerId).outfit, 'stealth');
  const events = await stream(owner);
  await call(`/rooms/${owner.roomId}/start`, owner);
  const state = await events.next(event => event.type === 'state');
  for (const [id, appearance] of [[owner.playerId, hostAppearance], [guest.playerId, guestAppearance]]) {
    const actor = state.game.players.find(player => player.id === id);
    assert.equal(actor.weaponId, appearance.weaponId); assert.equal(actor.outfit, appearance.outfit);
    assert.equal(actor.primaryColor, appearance.primaryColor.toLowerCase());
    assert.equal(actor.accentColor, appearance.accentColor.toLowerCase());
  }
  assert.ok(!JSON.stringify(state).includes(owner.token)); assert.ok(!JSON.stringify(state).includes(guest.token));
  assert.equal((await call(`/rooms/${owner.roomId}/input`, { ...guest, input: { weaponId: 'dual', outfit: 'royal', primaryColor: '#ff0000' } })).status, 202);
  const later = await events.next(event => event.type === 'state' && event.game.time > .06);
  assert.equal(later.game.players.find(player => player.id === guest.playerId).weaponId, 'rifle', 'control updates cannot change the admitted loadout');
  assert.equal((await call(`/rooms/${owner.roomId}/input`, { ...owner, input: { morph: 'yes' } })).status, 400);
  await call(`/rooms/${owner.roomId}/input`, { ...owner, input: { morph: true } });
  await events.next(event => event.type === 'state' && event.game.players.find(player => player.id === owner.playerId).form === 'water');
  const settled = await events.next(event => event.type === 'state' && event.game.time > .6);
  assert.equal(settled.game.players.find(player => player.id === owner.playerId).form, 'water', 'one morph packet changes form only once');
});

test('capture-the-flag, free-for-all, and warzone room modes start the selected simulation', async t => {
  const { call, create, stream } = await fixture(t);
  for (const mode of ['ctf', 'ffa', 'warzone']) {
    const owner = await create({ mode, classId: 'guardian', weaponId: 'bow', outfit: 'traveler' });
    const lobby = await (await call(`/rooms/${owner.roomId}`)).json();
    assert.equal(lobby.settings.mode, mode);
    assert.equal((await call(`/rooms/${owner.roomId}/start`, owner)).status,409,'human PvP must wait for a second real player');
    const guest=await (await call(`/rooms/${owner.roomId}/join`,{name:'Human opponent',classId:'marksman'})).json();
    const events = await stream(owner);
    assert.equal((await call(`/rooms/${owner.roomId}/start`, owner)).status, 200);
    const state = await events.next(event => event.type === 'state');
    assert.equal(state.game.mode, mode);
    assert.equal(state.game.players[0].weaponId, 'bow');
    assert.equal(state.game.players.length,2);
    assert.ok(state.game.players.every(player=>!player.isBot));
    events.close();
    await call(`/rooms/${owner.roomId}/leave`, owner);
  }
});

test('Creator lab commands validate bounded visual data and run custom forms, echoes, invisibility, and merging once', async t => {
  const { call, create, stream } = await fixture(t);
  const owner = await create({ classId: 'creator', realm: 'fields' });
  const events = await stream(owner);
  await call(`/rooms/${owner.roomId}/start`, owner);
  for (const customForm of [{name:'',material:'water',color:'#97dbff',scale:1}, {name:'bad',material:'water',color:'red',scale:1}, {name:'too large',material:'fire',color:'#ffbb55',scale:50}]) {
    assert.equal((await call(`/rooms/${owner.roomId}/input`, { ...owner, input: { customForm } })).status,400);
  }
  const customForm={name:'Silver tide',material:'water',color:'#97dbff',scale:1.4};
  assert.equal((await call(`/rooms/${owner.roomId}/input`,{...owner,input:{customForm}})).status,202);
  const custom=await events.next(e=>e.type==='state'&&e.game.player.form==='custom');
  assert.equal(custom.game.player.customForm.name,'Silver tide');assert.equal(custom.game.player.scale,1.4);
  await call(`/rooms/${owner.roomId}/input`,{...owner,input:{clone:true}});
  await events.next(e=>e.type==='state'&&e.game.echoes.length===1);
  await call(`/rooms/${owner.roomId}/input`,{...owner,input:{invisible:true}});
  await events.next(e=>e.type==='state'&&e.game.player.invisible===true);
  await call(`/rooms/${owner.roomId}/input`,{...owner,input:{merge:true}});
  const merged=await events.next(e=>e.type==='state'&&e.game.echoes.length===0&&e.game.echoesCreated===1);
  assert.ok(Math.abs(merged.game.player.scale-1.52)<1e-9);
  assert.equal(merged.game.player.classId,'creator');
});
