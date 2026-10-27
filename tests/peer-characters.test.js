import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPeerRoom, joinPeerRoom } from '../public/arena/peer-room.mjs';

// Exercise the real room protocol over an in-memory channel. This checks
// serialization/admission, not browser ICE or public WebRTC connectivity.
class Channel extends EventEmitter {
  open = false;
  dataChannel = { bufferedAmount: 0 };
  send(value) {
    const message = structuredClone(value);
    queueMicrotask(() => { if (this.other.open) this.other.emit('data', message); });
  }
  close() {
    if (!this.open) return;
    this.open = false; this.other.open = false;
    this.emit('close'); this.other.emit('close');
  }
}
class Peer extends EventEmitter {
  static peers = new Map();
  static nextId = 0;
  channels = [];
  constructor(id = `test-guest-${++Peer.nextId}`) {
    super(); this.id = id; Peer.peers.set(id, this);
    queueMicrotask(() => this.emit('open', id));
  }
  connect(id) {
    const target = Peer.peers.get(id);
    if (!target) throw new Error('Missing test peer.');
    const local = new Channel(), remote = new Channel();
    local.other = remote; remote.other = local;
    local.peer = id; remote.peer = this.id;
    this.channels.push(local); target.channels.push(remote);
    queueMicrotask(() => {
      target.emit('connection', remote);
      local.open = remote.open = true;
      remote.emit('open'); local.emit('open');
    });
    return local;
  }
  destroy() { Peer.peers.delete(this.id); for (const channel of this.channels) channel.close(); }
}
async function eventually(read) {
  for (let i = 0; i < 100; i++) {
    const value = read(); if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Expected room event did not arrive.');
}

test('peer room protocol preserves independent character appearances without granting powers', async t => {
  const previous = globalThis.window;
  globalThis.window = { Peer };
  t.after(() => { globalThis.window = previous; });
  const hostEvents = [], guestEvents = [];
  const host = await createPeerRoom({ name: 'Human host', classId: 'guardian', mode: 'ffa' }, e => hostEvents.push(e));
  t.after(() => host.leave());
  const appearance = { characterId: 'dragonborn', characterName: 'Copper Drake', skinTone: '#AABBCC', hairStyle: 'braids', hairColor: '#123456', bodyType: 'broad' };
  const guest = await joinPeerRoom(host.roomId, { name: 'Guest', classId: 'marksman', ...appearance }, e => guestEvents.push(e));
  t.after(() => guest.leave());
  const lobby = await eventually(() => guestEvents.find(e => e.type === 'lobby' && e.players.length === 2));
  assert.equal(lobby.players.find(p => p.id === host.playerId).characterId, 'human');
  const admitted = lobby.players.find(p => p.id === guest.playerId);
  for (const [key, value] of Object.entries(appearance)) assert.equal(admitted[key], key === 'skinTone' ? value.toLowerCase() : value);
  await host.start();
  const first = await eventually(() => guestEvents.find(e => e.type === 'state'));
  assert.equal(first.game.players.length, 2);
  assert.ok(first.game.players.every(p => !p.bot));
  const initial = first.game.players.find(p => p.id === guest.playerId);
  assert.equal(initial.characterId, 'dragonborn'); assert.equal(initial.maxHp, 105);
  await guest.sendInput({ moveX: -1, characterId: 'robot', skinTone: '#ffffff', hp: 99999 });
  const later = await eventually(() => hostEvents.find(e => e.type === 'state' && e.game.players.find(p => p.id === guest.playerId).x < initial.x - 5));
  const actor = later.game.players.find(p => p.id === guest.playerId);
  assert.equal(actor.characterId, 'dragonborn'); assert.equal(actor.characterName, 'Copper Drake');
  assert.equal(actor.skinTone, '#aabbcc'); assert.equal(actor.maxHp, 105);
  await assert.rejects(joinPeerRoom(host.roomId, { name: 'Invalid guest', characterId: 'unsupported' }), /supported character/);
  await assert.rejects(createPeerRoom({ name: 'Invalid owner', hairColor: 'red' }), /hex colors/);
});
