import { CLASSES, MODES, REALMS, CONTRACTS, createCoopGame, updateCoopGame } from './core.mjs';

// Public static-host co-op uses the community PeerJS signaling service and WebRTC.
// The room owner runs the authoritative simulation and must keep this tab open
// and in the foreground. Direct connectivity depends on each player's network;
// signaling/STUN cannot guarantee a route through every firewall or NAT.
const PEER_PREFIX = 'heavenward-v1-';
const ROOM_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EDGE_INPUTS = ['dash', 'special', 'jump', 'reload', 'interact', 'morph', 'mimic', 'clone', 'invisible', 'merge'];
const MAX_PLAYERS = 4;
const TIMEOUT = 12_000;

function copy(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function notify(callback, event) {
  // The app changes game.player to the viewer's actor. Never let that modify the
  // owner's simulation or another viewer's snapshot through a shared reference.
  try { callback(copy(event)); } catch (error) { console.error('Arena room callback failed:', error.message); }
}
function randomCode() {
  return [...crypto.getRandomValues(new Uint8Array(6))].map(byte => ALPHABET[byte % ALPHABET.length]).join('');
}
function playerName(value) {
  if (value === undefined) return 'Guardian';
  if (typeof value !== 'string') throw new Error('Choose a player name.');
  const name = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 24) throw new Error('Use a player name between 1 and 24 characters.');
  return name;
}
function choice(options, value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !Object.hasOwn(options, value)) throw new Error('Choose a valid class, mission, realm, and contract.');
  return value;
}
function appearanceFrom(value) {
  const appearance = {};
  for (const [key, allowed] of [['weaponId', ['blade', 'bow', 'staff', 'rifle', 'fists', 'dual']], ['outfit', ['royal', 'battle', 'traveler', 'stealth', 'space', 'robe']]]) {
    if (value?.[key] === undefined) continue;
    if (typeof value[key] !== 'string' || !allowed.includes(value[key])) throw new Error('Choose a valid weapon and outfit.');
    appearance[key] = value[key];
  }
  for (const key of ['primaryColor', 'accentColor']) {
    if (value?.[key] === undefined) continue;
    if (typeof value[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value[key])) throw new Error('Choose six-digit hex colors for your outfit.');
    appearance[key] = value[key].toLowerCase();
  }
  return appearance;
}
const rosterEntry = ({ id, name, classId, weaponId, outfit, primaryColor, accentColor }) => ({ id, name, classId, weaponId, outfit, primaryColor, accentColor });
function cleanInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid arena controls.');
  const result = {};
  for (const key of ['moveX', 'moveY', 'aimX', 'aimY']) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw new Error('Arena controls must use finite numbers.');
    const bound = key.startsWith('move') ? 1 : key === 'aimX' ? 2400 : 1600;
    result[key] = Math.max(-bound, Math.min(bound, value[key]));
  }
  for (const key of ['attack', 'aim', 'crouch', 'block', ...EDGE_INPUTS]) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error('Invalid arena action.');
    result[key] = value[key] === true;
  }
  if(value.customForm !== undefined) {
    const f=value.customForm;
    if(!f||typeof f!=='object'||Array.isArray(f)||typeof f.name!=='string'||!f.name.trim()||f.name.length>40||!['light','water','fire','gold','hero','smoke','cloud'].includes(f.material)||typeof f.color!=='string'||!/^#[0-9a-f]{6}$/i.test(f.color)||typeof f.scale!=='number'||!Number.isFinite(f.scale)||f.scale<.6||f.scale>1.8)throw new Error('Choose a valid named material form, color, and scale.');
    result.customForm={name:f.name.trim(),material:f.material,color:f.color,scale:f.scale};
  }
  return result;
}
function mergeInput(player, input) {
  for (const key of EDGE_INPUTS) input[key] ||= player.input[key] === true;
  input.customForm ??= player.input.customForm;
  player.input = input;
  player.inputAt = performance.now();
}
function decode(data) {
  if (typeof data === 'string') {
    if (data.length > 300_000) return null;
    try { data = JSON.parse(data); } catch { return null; }
  }
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}
function send(connection, event) {
  if (!connection.open) return false;
  const buffered = connection.dataChannel?.bufferedAmount || 0;
  if (buffered > 1_048_576) { connection.close(); return false; }
  if (buffered > 262_144 && event.type === 'state') return false;
  try { connection.send(event); return true; } catch { connection.close(); return false; }
}
function failure(error) {
  const type = error?.type;
  if (type === 'peer-unavailable') return new Error('Room not found. Check the code and ask the host to keep the room open.');
  if (type === 'browser-incompatible') return new Error('This browser does not support WebRTC co-op. Try a current Chrome, Firefox, or Safari browser.');
  return new Error('The public co-op connection failed. Check your internet connection and try again. Some networks block WebRTC.');
}
function openPeer(id, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    if (typeof window.Peer !== 'function') { reject(new Error('Co-op networking did not load. Reload the page while online.')); return; }
    let peer;
    try { peer = new window.Peer(id, { debug: 0 }); } catch (error) { reject(failure(error)); return; }
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('Public co-op signaling timed out. Check your internet connection and try again.')); }, Math.max(1, timeout));
    const onError = error => { clearTimeout(timer); peer.destroy(); reject(error?.type === 'unavailable-id' ? error : failure(error)); };
    peer.once('error', onError);
    peer.once('open', () => { clearTimeout(timer); peer.off('error', onError); resolve(peer); });
  });
}

export async function createPeerRoom(settings = {}, onEvent = () => {}) {
  const name = playerName(settings.name);
  const classId = choice(CLASSES, settings.classId, 'creator');
  const appearance = appearanceFrom(settings);
  const options = {
    mode: choice(MODES, settings.mode, 'survival'), realm: choice(REALMS, settings.realm, 'fields'),
    contractId: choice(CONTRACTS, settings.contractId, 'hunter'),
  };
  let peer, roomId;
  for (let attempt = 0; attempt < 3; attempt++) {
    roomId = randomCode();
    try { peer = await openPeer(PEER_PREFIX + roomId); break; }
    catch (error) { if (error?.type !== 'unavailable-id' || attempt === 2) throw error?.type === 'unavailable-id' ? new Error('Could not reserve a room code. Try creating the room again.') : error; }
  }
  const hostId = peer.id;
  const players = new Map([[hostId, { id: hostId, name, classId, ...appearance, input: {}, inputAt: 0, connection: null }]]);
  const pending = new Set();
  let game = null, phase = 'lobby', closed = false, lastTick = performance.now(), signalTimer;
  function lobby() {
    return { type: 'lobby', roomId, hostId, phase, capacity: MAX_PLAYERS, settings: { ...options }, players: [...players.values()].map(rosterEntry) };
  }
  function event() { return game ? { type: 'state', roomId, hostId, phase, game } : lobby(); }
  function broadcast(message = event()) {
    if (closed) return;
    for (const player of players.values()) if (player.connection) send(player.connection, message);
    notify(onEvent, message);
  }
  function removeGuest(id) {
    if (closed || !players.has(id) || id === hostId) return;
    players.delete(id);
    const actor = game?.players.find(player => player.id === id);
    if (actor) actor.hp = 0;
    broadcast();
  }
  function close(message) {
    if (closed) return;
    closed = true;
    const event = { type: 'left', roomId, message };
    for (const player of players.values()) if (player.connection) send(player.connection, event);
    notify(onEvent, event);
    clearInterval(timer); clearTimeout(signalTimer);
    for (const connection of pending) connection.close();
    pending.clear();
    for (const player of players.values()) player.connection?.close();
    players.clear(); peer.destroy();
  }
  function reject(connection, message) {
    send(connection, { type: 'error', message });
    setTimeout(() => connection.close(), 150);
  }
  peer.on('connection', connection => {
    if (closed || pending.size >= 8) { connection.close(); return; }
    pending.add(connection);
    let joined = false, frames = 0, rateAt = performance.now();
    const timeout = setTimeout(() => { if (!joined) { pending.delete(connection); connection.close(); } }, 5000);
    connection.on('data', raw => {
      if (closed) return;
      const data = decode(raw); if (!data) { reject(connection, 'Invalid room message.'); return; }
      if (performance.now() - rateAt > 1000) { rateAt = performance.now(); frames = 0; }
      if (++frames > 75) { reject(connection, 'Too many control messages. Rejoin the room.'); return; }
      if (!joined) {
        if (data.type !== 'join') { reject(connection, 'Join the room before sending controls.'); return; }
        if (phase !== 'lobby') { reject(connection, 'This match has started. Ask the host to create a new room.'); return; }
        if (players.size >= MAX_PLAYERS) { reject(connection, 'This room is full. Up to four players can join.'); return; }
        if (players.has(connection.peer)) { reject(connection, 'This player is already in the room.'); return; }
        try {
          const guestName = playerName(data.name), guestClass = choice(CLASSES, data.classId, 'guardian');
          if (guestClass === 'creator') { reject(connection, 'The Creator is reserved for the room owner. Choose a guardian class.'); return; }
          const appearance = appearanceFrom(data);
          const player = { id: connection.peer, name: guestName, classId: guestClass, ...appearance, input: {}, inputAt: 0, connection };
          players.set(player.id, player); joined = true; clearTimeout(timeout); pending.delete(connection);
          send(connection, { type: 'welcome', roomId, playerId: player.id, hostId, lobby: lobby() });
          broadcast();
        } catch (error) { reject(connection, error.message); }
        return;
      }
      const player = players.get(connection.peer);
      if (!player || player.connection !== connection) return;
      if (data.type === 'leave') { removeGuest(player.id); connection.close(); return; }
      if (data.type !== 'input' || phase !== 'playing') return;
      try { mergeInput(player, cleanInput(data.input)); }
      catch (error) { reject(connection, error.message); }
    });
    connection.on('close', () => { clearTimeout(timeout); pending.delete(connection); if (joined) removeGuest(connection.peer); });
    connection.on('error', () => { clearTimeout(timeout); pending.delete(connection); if (joined) removeGuest(connection.peer); connection.close(); });
  });
  peer.on('error', error => close(failure(error).message));
  peer.on('disconnected', () => {
    if (closed || signalTimer) return;
    try { peer.reconnect(); } catch { close('The room lost its signaling connection. Create a new room.'); return; }
    signalTimer = setTimeout(() => { signalTimer = null; if (peer.disconnected) close('The public co-op service disconnected. Create a new room when your connection returns.'); }, 8000);
  });
  peer.on('open', () => { clearTimeout(signalTimer); signalTimer = null; });
  peer.on('close', () => { if (!closed) close('The host connection closed. Create a new room.'); });
  const timer = setInterval(() => {
    if (closed) return;
    const now = performance.now(), dt = Math.min(.05, (now - lastTick) / 1000); lastTick = now;
    if (phase !== 'playing') return;
    const inputs = {};
    for (const player of players.values()) {
      inputs[player.id] = now - player.inputAt < 1000 ? { ...player.input } : {};
      for (const key of EDGE_INPUTS) player.input[key] = false;
      delete player.input.customForm;
    }
    updateCoopGame(game, dt, inputs);
    if (game.status !== 'playing') phase = 'finished';
    broadcast();
  }, 50);
  setTimeout(() => { if (!closed) broadcast(lobby()); }, 0);
  return {
    roomId, playerId: hostId, hostId, transport: 'peer',
    async start() {
      if (closed) throw new Error('This room has closed. Create another room.');
      if (phase === 'playing') throw new Error('The match is already running.');
      if(['ctf','ffa','warzone'].includes(options.mode)&&players.size<2)throw new Error('Human PvP needs at least two players. Share the room code first.');
      game = createCoopGame({ ...options, fillBots:false, seed: crypto.getRandomValues(new Uint32Array(1))[0] }, [...players.values()].map(rosterEntry));
      phase = 'playing'; lastTick = performance.now(); broadcast();
    },
    async sendInput(input) {
      if (closed) throw new Error('This room has closed.');
      if (phase === 'playing') mergeInput(players.get(hostId), cleanInput(input));
    },
    async leave() { close('The host closed the room. You can create or join another room for free.'); },
  };
}

export async function joinPeerRoom(code, settings = {}, onEvent = () => {}) {
  const roomId = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!ROOM_PATTERN.test(roomId)) throw new Error('Enter the six-character room code.');
  const name = playerName(settings.name), classId = choice(CLASSES, settings.classId, 'guardian');
  if (classId === 'creator') throw new Error('Choose a guardian class to join. The Creator belongs to the room owner.');
  const appearance = appearanceFrom(settings);
  const began = performance.now();
  const peer = await openPeer(undefined);
  return new Promise((resolve, reject) => {
    let connection, session, closed = false, settled = false, hostId = PEER_PREFIX + roomId;
    const timeout = setTimeout(() => close('Could not reach the room within twelve seconds. Check the code, ask the host to keep the tab open, or try another network.'), Math.max(1, TIMEOUT - (performance.now() - began)));
    function close(message) {
      if (closed) return;
      closed = true; clearTimeout(timeout);
      if (!settled) { settled = true; reject(new Error(message)); }
      else notify(onEvent, { type: 'left', roomId, message });
      connection?.close(); peer.destroy();
    }
    try { connection = peer.connect(hostId, { reliable: true, serialization: 'binary' }); }
    catch (error) { close(failure(error).message); return; }
    connection.on('open', () => { if (!closed) send(connection, { type: 'join', name, classId, ...appearance }); });
    connection.on('data', raw => {
      if (closed) return;
      const data = decode(raw); if (!data) return;
      if (data.type === 'error' || data.type === 'left') { close(typeof data.message === 'string' ? data.message.slice(0, 500) : 'This room has closed.'); return; }
      if (data.type === 'welcome' && !session) {
        if (data.roomId !== roomId || data.playerId !== peer.id || data.hostId !== hostId) { close('The room handshake was invalid. Try joining again.'); return; }
        session = {
          roomId, playerId: data.playerId, hostId, transport: 'peer',
          async start() { throw new Error('Only the room owner can start the match.'); },
          async sendInput(input) {
            if (closed || !connection.open) throw new Error('You disconnected from the room. Rejoin to play again.');
            if (!send(connection, { type: 'input', input: cleanInput(input) })) throw new Error('The connection is busy. Try again shortly.');
          },
          async leave() { if (!closed) { send(connection, { type: 'leave' }); close('You left the arena room.'); } },
        };
        clearTimeout(timeout); settled = true; resolve(session);
        setTimeout(() => { if (!closed && data.lobby) notify(onEvent, data.lobby); }, 0);
        return;
      }
      if (!session) return;
      if (data.type === 'lobby' && data.roomId === roomId && Array.isArray(data.players) && data.players.length <= MAX_PLAYERS) notify(onEvent, data);
      else if (data.type === 'state' && data.roomId === roomId && data.game && Array.isArray(data.game.players) && data.game.players.length <= MAX_PLAYERS && Number.isFinite(data.game.time)) notify(onEvent, data);
    });
    connection.on('close', () => close('The host disconnected or closed the room. Ask the host for a new room code.'));
    connection.on('error', error => close(failure(error).message));
    peer.on('error', error => close(failure(error).message));
    peer.on('close', () => close('Your co-op connection closed. Rejoin the room to try again.'));
    peer.on('disconnected', () => {
      // Open data channels can survive a lost signaling connection. Keep playing
      // while trying to restore signaling; a channel close still ends the room.
      if (!closed) { try { peer.reconnect(); } catch { close('Co-op signaling disconnected. Check your connection and rejoin.'); } }
    });
  });
}
