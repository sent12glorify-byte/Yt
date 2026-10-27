import express from 'express';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { CLASSES, MODES, REALMS, CONTRACTS, characterAppearance, createCoopGame, updateCoopGame } from './public/arena/core.mjs';

// Ephemeral, server-authoritative co-op rooms. No account or paid service is used.
// Rooms intentionally live on one Node instance; restarting it ends active rooms.
export function createArenaRoomsRouter({ tickMs = 50, maxRooms = 64, capacity = 4, roomTtlMs = 15 * 60_000, disconnectMs = 15_000 } = {}) {
  const router = express.Router();
  const rooms = new Map();
  const rateWindows = new Map();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let closed = false;
  router.use(express.json({ limit: '8kb' }));
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (closed) return res.status(503).json({ error: 'The arena server is shutting down.' });
    next();
  });

  const fail = (res, status, error) => res.status(status).json({ error });
  function limited(key, limit, windowMs = 60_000) {
    const now = Date.now();
    let bucket = rateWindows.get(key);
    if (!bucket || now - bucket.started >= windowMs) {
      bucket = { started: now, count: 0 };
      rateWindows.set(key, bucket);
    }
    bucket.count++;
    return bucket.count > limit;
  }
  function allowedJoin(req, res) {
    if (limited(`join:${req.ip}`, 60)) { fail(res, 429, 'Too many room requests. Try again in a minute.'); return false; }
    return true;
  }
  function nameFrom(value) {
    if (value === undefined) return 'Guardian';
    if (typeof value !== 'string') return null;
    const name = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().replace(/\s+/g, ' ');
    return name.length > 0 && name.length <= 24 ? name : null;
  }
  const validChoice = (map, value, fallback) => value === undefined ? fallback : typeof value === 'string' && Object.hasOwn(map, value) ? value : null;
  function appearanceFrom(body) {
    let appearance;
    try { appearance = characterAppearance(body, true); } catch { return null; }
    for (const [key, allowed] of [['weaponId', ['blade', 'bow', 'staff', 'rifle', 'fists', 'dual']], ['outfit', ['royal', 'battle', 'traveler', 'stealth', 'space', 'robe']]]) {
      if (body?.[key] === undefined) continue;
      if (typeof body[key] !== 'string' || !allowed.includes(body[key])) return null;
      appearance[key] = body[key];
    }
    for (const key of ['primaryColor', 'accentColor']) {
      if (body?.[key] === undefined) continue;
      if (typeof body[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body[key])) return null;
      appearance[key] = body[key].toLowerCase();
    }
    return appearance;
  }
  const rosterEntry = ({ id, name, classId, weaponId, outfit, primaryColor, accentColor, characterId, characterName, skinTone, hairStyle, hairColor, bodyType }) => ({ id, name, classId, weaponId, outfit, primaryColor, accentColor, characterId, characterName, skinTone, hairStyle, hairColor, bodyType });
  function publicLobby(room) {
    return {
      roomId: room.id, phase: room.phase, hostId: room.hostId, capacity,
      settings: { ...room.settings },
      players: [...room.players.values()].map(player => ({ ...rosterEntry(player), connected: player.streams.size > 0 })),
    };
  }
  function send(stream, data) {
    if (stream.destroyed || stream.writableEnded) return false;
    // Never accumulate an unlimited stream queue for a slow/disconnected browser.
    if (stream.writableLength > 256 * 1024) { stream.end(); return false; }
    stream.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  }
  function roomEvent(room) {
    return room.game ? { type: 'state', roomId: room.id, hostId: room.hostId, phase: room.phase, game: room.game } : { type: 'lobby', ...publicLobby(room) };
  }
  function broadcast(room) {
    const event = roomEvent(room);
    for (const player of room.players.values()) for (const stream of player.streams) send(stream, event);
  }
  function closeRoom(room, message = 'This arena room has closed.') {
    for (const player of room.players.values()) for (const stream of player.streams) {
      send(stream, { type: 'left', message }); stream.end();
    }
    rooms.delete(room.id);
  }
  function removePlayer(room, player, message = 'You left the arena.') {
    for (const stream of player.streams) { send(stream, { type: 'left', message }); stream.end(); }
    room.players.delete(player.id);
    if (room.game) {
      const actor = room.game.players.find(candidate => candidate.id === player.id);
      if (actor) actor.hp = 0;
    }
    if (room.players.size === 0) { closeRoom(room); return; }
    if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
    room.lastActivity = Date.now();
    broadcast(room);
  }
  function findRoom(req, res) {
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(req.params.roomId || '')) { fail(res, 400, 'Enter a valid six-character room code.'); return null; }
    const room = rooms.get(req.params.roomId);
    if (!room) { fail(res, 404, 'Room not found. It may have expired.'); return null; }
    return room;
  }
  function authenticate(room, credentials, res) {
    const player = room.players.get(credentials?.playerId);
    const token = credentials?.token;
    if (!player || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(player.token, 'hex'))) {
      fail(res, 401, 'Your room session is missing or invalid. Rejoin the room.'); return null;
    }
    return player;
  }
  function newPlayer(name, classId, appearance) {
    return { id: randomUUID(), token: randomBytes(32).toString('hex'), name, classId, ...appearance, input: {}, inputAt: 0, streams: new Set(), disconnectedAt: Date.now() };
  }
  const credentials = (room, player) => ({ roomId: room.id, playerId: player.id, token: player.token });
  function normalizeInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const result = {};
    for (const key of ['moveX', 'moveY', 'aimX', 'aimY']) {
      if (input[key] === undefined) continue;
      if (typeof input[key] !== 'number' || !Number.isFinite(input[key])) return null;
      const maximum = key.startsWith('move') ? 1 : key === 'aimX' ? 2400 : 1600;
      const minimum = key.startsWith('move') ? -1 : -maximum;
      result[key] = Math.max(minimum, Math.min(maximum, input[key]));
    }
    for (const key of ['attack', 'dash', 'special', 'aim', 'crouch', 'block', 'jump', 'reload', 'interact', 'morph', 'mimic', 'clone', 'invisible', 'merge']) {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') return null;
      result[key] = input[key] === true;
    }
    if(input.customForm !== undefined) {
      const f=input.customForm;
      if(!f||typeof f!=='object'||Array.isArray(f)||typeof f.name!=='string'||!f.name.trim()||f.name.length>40||!['light','water','fire','gold','hero','smoke','cloud'].includes(f.material)||typeof f.color!=='string'||!/^#[0-9a-f]{6}$/i.test(f.color)||typeof f.scale!=='number'||!Number.isFinite(f.scale)||f.scale<.6||f.scale>1.8)return null;
      result.customForm={name:f.name.trim(),material:f.material,color:f.color,scale:f.scale};
    }
    return result;
  }

  router.post('/rooms', (req, res) => {
    if (!allowedJoin(req, res)) return;
    if (rooms.size >= maxRooms) return fail(res, 503, 'All arena rooms are busy. Try again shortly.');
    const body = req.body || {};
    const name = nameFrom(body.name);
    const classId = validChoice(CLASSES, body.classId, 'guardian');
    const mode = validChoice(MODES, body.mode, 'survival');
    const realm = validChoice(REALMS, body.realm, 'citadel');
    const contractId = validChoice(CONTRACTS, body.contractId, 'hunter');
    if (!name || !classId || !mode || !realm || !contractId) return fail(res, 400, 'Choose a valid name, class, mission, realm, and contract.');
    const appearance = appearanceFrom(body);
    if (!appearance) return fail(res, 400, 'Choose a valid character, appearance, weapon, outfit, and six-digit hex colors.');
    let id;
    do { id = [...randomBytes(6)].map(byte => alphabet[byte % alphabet.length]).join(''); } while (rooms.has(id));
    const player = newPlayer(name, classId, appearance);
    const room = { id, phase: 'lobby', settings: { mode, realm, contractId }, hostId: player.id, players: new Map([[player.id, player]]), game: null, lastActivity: Date.now(), lastTick: Date.now() };
    rooms.set(id, room);
    res.status(201).json(credentials(room, player));
  });
  router.get('/rooms/:roomId', (req, res) => {
    const room = findRoom(req, res);
    if (room) res.json(publicLobby(room));
  });
  router.post('/rooms/:roomId/join', (req, res) => {
    if (!allowedJoin(req, res)) return;
    const room = findRoom(req, res); if (!room) return;
    if (room.phase !== 'lobby') return fail(res, 409, 'This match has already started. Create a new room to play together.');
    if (room.players.size >= capacity) return fail(res, 409, 'This room is full. Up to four guardians can play together.');
    const name = nameFrom(req.body?.name);
    const classId = validChoice(CLASSES, req.body?.classId, 'guardian');
    if (!name || !classId) return fail(res, 400, 'Choose a valid name and combat class.');
    if (classId === 'creator') return fail(res, 403, 'The Creator is reserved for the room owner. Choose a guardian class to join.');
    const appearance = appearanceFrom(req.body);
    if (!appearance) return fail(res, 400, 'Choose a valid character, appearance, weapon, outfit, and six-digit hex colors.');
    const player = newPlayer(name, classId, appearance);
    room.players.set(player.id, player); room.lastActivity = Date.now();
    broadcast(room);
    res.status(201).json(credentials(room, player));
  });
  router.post('/rooms/:roomId/start', (req, res) => {
    const room = findRoom(req, res); if (!room) return;
    const player = authenticate(room, req.body, res); if (!player) return;
    if (player.id !== room.hostId) return fail(res, 403, 'Only the room host can start the match.');
    if (room.phase === 'playing') return fail(res, 409, 'The match has already started.');
    if(['ctf','ffa','warzone'].includes(room.settings.mode)&&room.players.size<2)return fail(res,409,'Human PvP needs at least two players. Share the room code first.');
    const roster = [...room.players.values()].map(rosterEntry);
    room.game = createCoopGame({ ...room.settings, fillBots:false, seed: randomBytes(4).readUInt32LE() }, roster);
    for (const participant of room.players.values()) { participant.input = {}; participant.inputAt = 0; }
    room.phase = 'playing'; room.lastActivity = Date.now(); room.lastTick = Date.now();
    broadcast(room);
    res.json({ started: true, roomId: room.id });
  });
  router.post('/rooms/:roomId/input', (req, res) => {
    const room = findRoom(req, res); if (!room) return;
    const player = authenticate(room, req.body, res); if (!player) return;
    if (limited(`input:${player.id}`, 70, 1000)) return fail(res, 429, 'Too many input updates.');
    if (room.phase !== 'playing') return fail(res, 409, 'The match is not running.');
    const input = normalizeInput(req.body.input);
    if (!input) return fail(res, 400, 'Input must contain finite movement/aim values and boolean controls.');
    // Preserve a one-shot action until the next simulation tick consumes it.
    for (const key of ['dash', 'special', 'jump', 'reload', 'interact', 'morph', 'mimic', 'clone', 'invisible', 'merge']) input[key] ||= player.input[key] === true;
    input.customForm ??= player.input.customForm;
    player.input = input; player.inputAt = Date.now(); room.lastActivity = Date.now();
    res.status(202).json({ accepted: true });
  });
  router.post('/rooms/:roomId/leave', (req, res) => {
    const room = findRoom(req, res); if (!room) return;
    const player = authenticate(room, req.body, res); if (!player) return;
    removePlayer(room, player);
    res.json({ left: true });
  });
  router.get('/rooms/:roomId/events', (req, res) => {
    const room = findRoom(req, res); if (!room) return;
    const player = authenticate(room, req.query, res); if (!player) return;
    if (player.streams.size >= 2) return fail(res, 429, 'Too many room streams. Close another tab first.');
    res.status(200).set({ 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache, no-store' });
    res.flushHeaders();
    res.write('retry: 1500\n\n');
    player.streams.add(res); player.disconnectedAt = null; room.lastActivity = Date.now();
    send(res, roomEvent(room));
    if (!room.game) broadcast(room);
    req.on('close', () => {
      player.streams.delete(res);
      if (!player.streams.size) player.disconnectedAt = Date.now();
      if (rooms.has(room.id) && !room.game) broadcast(room);
    });
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError || error.type === 'entity.too.large') return fail(res, 400, 'Send a valid, small JSON request.');
    console.error('Arena room error:', error.message);
    fail(res, 500, 'The arena could not process that request.');
  });

  const timer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (now - room.lastActivity > roomTtlMs) { closeRoom(room, 'This inactive room expired. Create a new room.'); continue; }
      for (const player of room.players.values()) {
        if (player.disconnectedAt !== null && now - player.disconnectedAt > disconnectMs) removePlayer(room, player, 'You disconnected from the arena.');
      }
      if (!rooms.has(room.id)) continue;
      if (room.phase === 'playing') {
        const inputs = Object.fromEntries([...room.players.values()].map(player => {
          const input = now - player.inputAt < 1000 ? { ...player.input } : {};
          for (const key of ['dash', 'special', 'jump', 'reload', 'interact', 'morph', 'mimic', 'clone', 'invisible', 'merge']) player.input[key] = false;
          delete player.input.customForm;
          return [player.id, input];
        }));
        updateCoopGame(room.game, Math.min(.05, (now - room.lastTick) / 1000), inputs);
        if (room.game.status !== 'playing') room.phase = 'finished';
        broadcast(room);
      }
      room.lastTick = now;
    }
    for (const [key, bucket] of rateWindows) if (now - bucket.started > 60_000) rateWindows.delete(key);
  }, Math.max(10, tickMs));
  timer.unref();
  const heartbeat = setInterval(() => {
    for (const room of rooms.values()) for (const player of room.players.values()) for (const stream of player.streams) {
      if (!stream.destroyed && !stream.writableEnded && stream.writableLength < 256 * 1024) stream.write(': heartbeat\n\n');
    }
  }, 10_000);
  heartbeat.unref();
  router.close = () => {
    if (closed) return;
    closed = true; clearInterval(timer); clearInterval(heartbeat);
    for (const room of rooms.values()) closeRoom(room, 'The arena server stopped.');
    rateWindows.clear();
  };
  return router;
}
