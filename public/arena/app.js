import { CLASSES, MODES, REALMS, CONTRACTS, FORMS, WEAPONS, getForm, UPGRADE_COSTS, createGame, updateGame } from './core.mjs';
import { createGamepadReader } from './gamepad.mjs';
import { createPeerRoom, joinPeerRoom } from './peer-room.mjs';

const $ = id => document.getElementById(id);
const canvas = $('arena');
const ctx = canvas.getContext('2d');
const STORAGE_KEY = 'heavenward-career-v1';
const selection = { classId: 'creator', mode: 'ffa', realm: 'fields', contractId: 'hunter', weaponId: 'rifle', outfit: 'battle', primaryColor: '#e8c981', accentColor: '#62d8cf' };
const number = (v, max = 100000000) => Math.min(max, Math.max(0, Number.isFinite(v) ? Math.floor(v) : 0));
let storageWorks = true;
function loadCareer() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { storageWorks = false; }
  return { bank: number(saved.bank), xp: number(saved.xp), runs: number(saved.runs), best: number(saved.best), wins: number(saved.wins), upgrades: Object.fromEntries(['vigor', 'power', 'focus'].map(key => [key, number(saved.upgrades?.[key], 3)])) };
}
let career = loadCareer();
let game = createGame({ ...selection, fillBots:false, upgrades: career.upgrades });
let screen = 'menu';
let paused = false;
let credited = false;
let frameTime = performance.now();
let view = { width: 1200, height: 800, scale: 1, x: 0, y: 0, dpr: 1 };
let pointer = { x: 850, y: 400, down: false, active: false };
let keys = new Set();
let joystick = { x: 0, y: 0, active: false, id: null };
let touchAttack = false;
let requestDash = false;
let requestSpecial = false;
let requestJump = false;
let requestReload = false;
let requestInteract = false;
let requestMorph = false;
let requestMimic = false;
let requestInvisible=false,requestClone=false,requestMerge=false,requestCustomForm=null;
let focusAim = false;
let touchCrouch = false;
let touchBlock = false;
let toastTimer;
let soundEnabled = false;
let audio;
let lastKills = 0;
let lastHp = 0;
let hudTime = 0;
let background;
let backgroundRealm;
let online = null;
let onlineBusy = false;
let inputSending = false;
let nextInputAt = 0;
let queuedInput = {};
let lastNetworkError = 0;
const readGamepad = createGamepadReader();
let controller = { connected: false };

function controllerMenus(pad) {
  if (!pad.connected) return;
  if (screen === 'playing' && pad.pause) setPause(!paused);
  if (screen === 'playing' && !paused) return;
  if (screen === 'playing' && paused && pad.back) { setPause(false); return; }
  const buttons = [...document.querySelectorAll('button:not(:disabled), a[href]')].filter(button => button.getClientRects().length && (!paused || button.closest('#pause-overlay')));
  if (!buttons.length) return;
  let index = buttons.indexOf(document.activeElement);
  if (pad.nav) { index = (index + pad.nav + buttons.length) % buttons.length; buttons[index].focus({ preventScroll: false }); }
  if (pad.select) {
    const target = buttons.includes(document.activeElement) ? document.activeElement : paused ? $('resume') : screen === 'menu' ? $('start') : screen === 'result' ? $('again') : $('online-start');
    if (!target.disabled && !target.hidden) target.click();
  }
}

async function roomRequest(path, body) {
  const response = await fetch('/api/arena' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || `Room request failed (${response.status}).`);
  return result;
}
function credentials() { return { playerId: online.playerId, token: online.token }; }
function showRoster(players, hostId) {
  $('online-roster').replaceChildren();
  for (const player of players) {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = `${player.name}${player.id === hostId ? ' · host' : ''}${player.id === online.playerId ? ' · you' : ''}`;
    const detail = document.createElement('span');
    detail.textContent = `${CLASSES[player.classId]?.name || player.classId}${player.hp === 0 ? ' · fallen' : ''}`;
    item.append(label, detail); $('online-roster').append(item);
  }
}
function showLobby(data) {
  if (!online) return;
  online.hostId = data.hostId;
  online.phase = data.phase;
  online.settings=data.settings||online.settings;
  const needsOpponent=['ctf','ffa','warzone'].includes(online.settings?.mode);
  $('online-start').disabled=needsOpponent&&data.players.length<2;
  $('online-code').textContent = online.roomId;
  $('online-status').textContent = `${data.players.length} / 4 human players · ${needsOpponent&&data.players.length<2?'Share your invite. At least two players are needed.':online.playerId===data.hostId?'Start when everyone is ready.':'Waiting for the host.'}`;
  $('online-start').hidden = online.playerId !== data.hostId;
  showRoster(data.players, data.hostId);
}
function handleRoomData(data) {
  if (!online) return;
    if (data.type === 'lobby') { showLobby(data); return; }
    if (data.type === 'left') { const message = data.message || 'You left the room.'; detachRoom(); goMenu(); toast(message); return; }
    if (data.type !== 'state' || !data.game) return;
    if (data.hostId) online.hostId = data.hostId;
    const freshMatch = data.phase === 'playing' && online.phase !== 'playing';
    online.phase = data.phase;
    game = data.game;
    const self = game.players.find(player => player.id === online.playerId);
    if (!self) { detachRoom(); goMenu(); toast('Your player is no longer in this room.'); return; }
    game.player = self; game.classId = self.classId; game.upgrades = self.upgrades;
    if (freshMatch) {
      screen = 'playing'; paused = false; credited = false; clearInput();
      $('menu').hidden = $('result-overlay').hidden = $('pause-overlay').hidden = true;
      $('touch-controls').hidden = false; $('pause').disabled = false;
      document.body.classList.add('in-game');
      lastKills = game.kills; lastHp = self.hp;
      canvas.focus({ preventScroll: true });
    }
    $('game-session').textContent = `${game.competitive?'Human PvP':'Human co-op'} · ${online.roomId}`;
    $('online-start').hidden = data.phase === 'playing' || online.playerId !== online.hostId;
    $('online-status').textContent = data.phase === 'finished' ? 'Match complete. The host can start another.' : self.hp <= 0 ? 'Your angel fell. Watch your teammates defend Heaven.' : 'Shared arena · controls are live';
    showRoster(game.players, online.hostId);
    updateHud();
    if (game.status !== 'playing' && screen === 'playing') finishRun();
}
function connectRoom(result) {
  online = { ...result, phase: 'lobby', hostId: result.hostId || null };
  screen = 'lobby'; paused = false; credited = false;
  clearInput();
  $('menu').hidden = true;
  $('result-overlay').hidden = true;
  $('pause-overlay').hidden = true;
  $('touch-controls').hidden = true;
  $('online-panel').hidden = false;
  $('pause').disabled = true;
  $('game-session').textContent = 'Co-op lobby · free to join';
  document.body.classList.remove('in-game');
  if (result.transport === 'peer') return;
  const params = new URLSearchParams(credentials());
  const events = new EventSource(`/api/arena/rooms/${online.roomId}/events?${params}`);
  online.events = events;
  events.onmessage = event => {
    if (!online || online.events !== events) return;
    try { handleRoomData(JSON.parse(event.data)); } catch { toast('A room update could not be read.'); }
  };
  events.onerror = () => { if (online?.events === events) $('online-status').textContent = 'Connection interrupted. Reconnecting…'; };
}
function detachRoom() {
  online?.events?.close();
  online = null; queuedInput = {}; inputSending = false;
  $('online-panel').hidden = true;
  $('game-session').textContent = 'Solo · local progression';
}
async function leaveRoom() {
  if (!online) return;
  if (online.transport === 'peer') { const session = online; detachRoom(); goMenu(); await session.leave(); return; }
  const path = `/rooms/${online.roomId}/leave`, auth = credentials();
  detachRoom(); goMenu();
  await roomRequest(path, auth).catch(() => {});
}
async function sendRoomInput(input) {
  if (!online || online.phase !== 'playing') return;
  inputSending = true;
  const session = online;
  try { if (session.transport === 'peer') await session.sendInput(input); else await roomRequest(`/rooms/${session.roomId}/input`, { ...credentials(), input }); }
  catch (error) {
    if (performance.now() - lastNetworkError > 5000) { toast(error.message); lastNetworkError = performance.now(); }
  } finally { if (online === session) inputSending = false; }
}
async function openRoom(join) {
  if (onlineBusy || online) return;
  onlineBusy = true;
  $('create-room').disabled = $('join-room').disabled = true;
  try {
    const name = $('player-name').value.trim() || 'Guardian';
    if (join) {
      const code = $('room-code').value.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Enter a six-character room code.');
      const classId = selection.classId === 'creator' ? 'guardian' : selection.classId;
      const look={weaponId:selection.weaponId,outfit:selection.outfit,primaryColor:selection.primaryColor,accentColor:selection.accentColor};
      const result = window.HEAVENWARD_STATIC ? await joinPeerRoom(code, { name, classId, ...look }, handleRoomData) : await roomRequest(`/rooms/${code}/join`, { name, classId, ...look });
      connectRoom(result);
      if (selection.classId === 'creator') toast('Guests enter as Dawn Guardians. The Creator role belongs to the host.');
    } else {
      const result = window.HEAVENWARD_STATIC ? await createPeerRoom({ name, ...selection }, handleRoomData) : await roomRequest('/rooms', { name, ...selection });
      connectRoom(result);
    }
  } catch (error) { toast(error.message); }
  finally { onlineBusy = false; $('create-room').disabled = $('join-room').disabled = false; }
}
$('create-room').addEventListener('click', () => openRoom(false));
$('join-room').addEventListener('click', () => openRoom(true));
$('online-start').addEventListener('click', async () => {
  if (!online || online.playerId !== online.hostId) return;
  try { if (online.transport === 'peer') await online.start(); else await roomRequest(`/rooms/${online.roomId}/start`, credentials()); }
  catch (error) { toast(error.message); }
});
$('online-leave').addEventListener('click', leaveRoom);
$('invite-link').addEventListener('click', async event => {
  event.preventDefault();
  if (!online) return;
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const url = new URL(location.href); url.search = ''; url.searchParams.set('room', online.roomId);
  const invite = loopback ? online.roomId : url.href;
  try { await navigator.clipboard.writeText(invite); toast(loopback ? 'Room code copied. Friends must open the same publicly hosted server to join.' : 'Invite copied. Share it with your friends.'); }
  catch { toast(`Room code: ${online.roomId}. Friends must open the same hosted server.`); }
});
$('setup')?.addEventListener('click', async () => { if (online) await leaveRoom(); else goMenu(); });
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode && /^[A-Z0-9]{6}$/i.test(inviteCode)) $('room-code').value = inviteCode.toUpperCase();
if (location.protocol === 'file:') {
  $('create-room').disabled = $('join-room').disabled = true;
  $('create-room').title = $('join-room').title = 'Co-op requires the Node server edition; this file plays solo offline.';
  const note = document.createElement('p'); note.className = 'menu-description'; note.textContent = 'Offline edition: solo play is ready. Free co-op rooms are available in the Node server edition.';
  $('create-room').parentElement.after(note);
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; $('toast').classList.remove('visible'); }, 3600);
}
function saveCareer() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(career)); } catch { storageWorks = false; toast('Browser storage is unavailable. Progress lasts for this session.'); }
}
function updateCareer() {
  $('bank').textContent = career.bank;
  $('career-level').textContent = 1 + Math.floor(career.xp / 200);
  for (const key of ['vigor', 'power', 'focus']) {
    const level = career.upgrades[key];
    const cost = UPGRADE_COSTS[key]?.[level];
    const button = document.querySelector(`[data-upgrade="${key}"]`);
    $('upgrade-' + key).textContent = level >= 3 ? 'MAX · III' : `${level}/3 · ${cost} gold`;
    button.disabled = level >= 3 || career.bank < cost || screen === 'playing';
    button.title = level >= 3 ? 'Fully upgraded' : `Costs ${cost} gold. You have ${career.bank}.`;
  }
}
for (const [attribute, property] of [['class', 'classId'], ['mode', 'mode'], ['realm', 'realm'], ['contract', 'contractId']]) {
  for (const button of document.querySelectorAll(`[data-${attribute}]`)) {
    const activate = () => {
      selection[property] = button.dataset[attribute];
      if (property === 'classId') {
        selection.weaponId = { guardian:'blade', sunbow:'bow', stormcaller:'staff', marksman:'rifle', brawler:'fists', creator:'blade' }[selection.classId];
        $('weapon-select').value=selection.weaponId;
      }
      for (const other of document.querySelectorAll(`[data-${attribute}]`)) {
        const active = other === button;
        other.classList.toggle('selected', active);
        other.setAttribute('aria-pressed', String(active));
      }
      if (screen === 'menu') {
        game = createGame({ ...selection, fillBots:false, upgrades: career.upgrades });
        updateHud();
      }
    };
    button.addEventListener('click', activate);
    if (selection[property] === button.dataset[attribute]) {
      button.classList.add('selected');
      button.setAttribute('aria-pressed', 'true');
    } else button.setAttribute('aria-pressed', 'false');
  }
}
for (const [id, key] of [['weapon-select','weaponId'],['outfit-select','outfit'],['primary-color','primaryColor'],['accent-color','accentColor']]) {
  const element=$(id);
  element.value=selection[key];
  element.addEventListener('input',()=>{selection[key]=element.value;if(screen==='menu'){game=createGame({...selection,fillBots:false,upgrades:career.upgrades});updateHud();}});
}
$('randomize-look').addEventListener('click',()=>{
  const pick=values=>values[Math.floor(Math.random()*values.length)];
  selection.weaponId=pick(['blade','bow','staff','rifle','fists','dual']);
  selection.outfit=pick(['royal','battle','traveler','stealth','space','robe']);
  selection.primaryColor='#'+Math.floor(Math.random()*16777216).toString(16).padStart(6,'0');
  selection.accentColor='#'+Math.floor(Math.random()*16777216).toString(16).padStart(6,'0');
  for(const [id,key] of [['weapon-select','weaponId'],['outfit-select','outfit'],['primary-color','primaryColor'],['accent-color','accentColor']])$(id).value=selection[key];
  game=createGame({...selection,fillBots:false,upgrades:career.upgrades});updateHud();toast('New look and weapon selected for your next match.');
});
for (const button of document.querySelectorAll('[data-upgrade]')) {
  button.addEventListener('click', () => {
    const key = button.dataset.upgrade;
    const cost = UPGRADE_COSTS[key]?.[career.upgrades[key]];
    if (screen === 'playing' || cost === undefined || career.bank < cost) return;
    career.bank -= cost;
    career.upgrades[key]++;
    saveCareer();
    updateCareer();
    toast(`${{ vigor: 'Vitality', power: 'Radiance', focus: 'Focus' }[key]} upgraded. Applies to your next run.`);
  });
}

function tone(frequency, duration = .08, type = 'sine', gain = .035) {
  if (!soundEnabled) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .55, audio.currentTime + duration);
    volume.gain.setValueAtTime(gain, audio.currentTime);
    volume.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + duration);
  } catch { soundEnabled = false; $('sound').textContent = 'Sound unavailable'; }
}
function clearInput() {
  keys.clear(); pointer.down = false; touchAttack = false;
  joystick = { x: 0, y: 0, active: false, id: null };
  $('joystick-knob').style.transform = 'translate(0, 0)';
  requestDash = requestSpecial = false;
  requestJump = requestReload = false;
  requestInteract = false;
  requestMorph = requestMimic = false;
  requestInvisible=requestClone=requestMerge=false;requestCustomForm=null;
  focusAim = touchCrouch = touchBlock = false;
  for (const id of ['aim-touch', 'crouch-touch']) $(id)?.setAttribute('aria-pressed', 'false');
}
function startRun() {
  if (online) { toast('Leave your room before starting a solo run.'); return; }
  game = createGame({ ...selection, fillBots:true, name:$('player-name').value||'Your fighter', upgrades: { ...career.upgrades }, seed: Date.now() % 2147483647 });
  screen = 'playing'; paused = false; credited = false; lastKills = 0; lastHp = game.player.hp;
  clearInput();
  $('menu').hidden = true;
  $('result-overlay').hidden = true;
  $('pause-overlay').hidden = true;
  $('help-panel').hidden = true;
  $('help').setAttribute('aria-expanded', 'false');
  $('touch-controls').hidden = false;
  document.body.classList.add('in-game');
  $('pause').disabled = false;
  $('game-session').textContent='Optional practice · AI opponents';
  canvas.focus({ preventScroll: true });
  updateHud(); updateCareer();
  tone(520, .22);
  toast(`${REALMS[selection.realm].name}: ${MODES[selection.mode].description}`);
}
function goMenu() {
  screen = 'menu'; paused = false;
  clearInput();
  $('menu').hidden = false;
  $('result-overlay').hidden = true;
  $('pause-overlay').hidden = true;
  $('pause').disabled = true;
  $('touch-controls').hidden = true;
  $('help-panel').hidden = true;
  $('help').setAttribute('aria-expanded', 'false');
  document.body.classList.remove('in-game');
  game = createGame({ ...selection, fillBots:false, upgrades: career.upgrades });
  updateHud(); updateCareer();
  $('start').focus({ preventScroll: true });
}
function setPause(value) {
  if (screen !== 'playing') return;
  paused = value;
  $('pause-overlay').hidden = !value;
  $('pause').textContent = value ? '▶' : 'Ⅱ';
  $('pause').setAttribute('aria-label', value ? 'Resume game' : 'Pause game');
  $('pause').setAttribute('aria-pressed', String(value));
  clearInput();
  if (!value) { $('help-panel').hidden = true; $('help').setAttribute('aria-expanded', 'false'); }
  if (online && value) { sendRoomInput({}); toast('Online matches keep running while your controls are paused.'); }
  if (value) $('resume').focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
}
function finishRun() {
  if (credited) return;
  credited = true;
  screen = 'result'; clearInput();
  const reward = number(game.reward);
  const victory=game.competitive?(game.winner===game.player.id||game.winner===game.player.team):game.status==='won';
  career.bank += reward;
  career.xp += Math.max(10, Math.floor(game.score / 5));
  career.runs++; career.best = Math.max(career.best, game.score);
  if (victory) career.wins++;
  saveCareer(); updateCareer();
  $('result-title').textContent = game.competitive?(game.winner==='draw'?'An even battle.':victory?'Victory is yours.':'The battle is complete.'):victory?'Heaven stands.':'Rise again, guardian.';
  $('result-summary').textContent = game.competitive?game.message:victory?'Your light held against the darkness. The gates remain protected.':'Your angel fell in battle. Keep your earned gold, strengthen your light, and try again.';
  $('again').textContent = online ? 'RETURN TO ROOM' : 'FLY AGAIN';
  $('result-stats').replaceChildren();
  for (const [label, value] of [['Score', game.score], ['Defeated', game.kills], ['Gold earned', '+' + reward], ['Best score', career.best], ['Contract', game.contract.completed ? 'Completed' : `${Math.floor(game.contract.progress)} / ${game.contract.target}`]]) {
    const stat = document.createElement('div');
    const name = document.createElement('span'); name.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value;
    stat.append(name, strong); $('result-stats').append(stat);
  }
  $('result-overlay').hidden = false;
  $('pause').disabled = true;
  document.body.classList.remove('in-game');
  $('again').focus({ preventScroll: true });
  tone(game.status === 'won' ? 880 : 160, .55);
}
$('start').addEventListener('click', startRun);
$('again').addEventListener('click', () => { if (online) { screen = 'lobby'; $('result-overlay').hidden = true; $('online-start').hidden = online.playerId !== online.hostId; toast('The host can start the next co-op match.'); } else startRun(); });
$('menu-button').addEventListener('click', async () => { if (online) await leaveRoom(); else goMenu(); });
$('pause').addEventListener('click', () => setPause(!paused));
$('resume').addEventListener('click', () => setPause(false));
$('abandon').addEventListener('click', async () => { if (online) await leaveRoom(); else goMenu(); toast('Run abandoned. No gold awarded for unfinished runs.'); });
$('help').addEventListener('click', () => {
  const showing = $('help-panel').hidden;
  $('help-panel').hidden = !showing;
  $('help').setAttribute('aria-expanded', String(showing));
  if (showing && screen === 'playing') { setPause(true); $('pause-overlay').hidden = true; }
  else if (!showing && screen === 'playing' && paused) setPause(false);
});
$('sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  $('sound').textContent = soundEnabled ? 'Sound on' : 'Sound off';
  $('sound').setAttribute('aria-pressed', String(soundEnabled));
  if (soundEnabled) tone(660, .13);
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { toast('Fullscreen is unavailable in this browser.'); }
});
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });

function aimAt(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = (event.clientX - rect.left - view.x) / view.scale;
  pointer.y = (event.clientY - rect.top - view.y) / view.scale;
  pointer.active = true;
}
canvas.addEventListener('pointermove', aimAt);
canvas.addEventListener('pointerdown', event => {
  if (screen !== 'playing' || paused) return;
  if (event.button === 2) { focusAim = true; aimAt(event); canvas.setPointerCapture(event.pointerId); return; }
  if (event.button !== 0) return;
  aimAt(event); pointer.down = true;
  canvas.setPointerCapture(event.pointerId);
  canvas.focus({ preventScroll: true });
});
canvas.addEventListener('pointerup', event => { if (event.button === 2) focusAim = false; else pointer.down = false; });
canvas.addEventListener('pointercancel', () => { pointer.down = false; focusAim = false; });
canvas.addEventListener('contextmenu', event => event.preventDefault());
const gameKeys = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','KeyQ','KeyP','Escape','KeyC','KeyF','KeyE','KeyR','KeyV','KeyT','KeyG','KeyI','KeyH','KeyM'];
window.addEventListener('keydown', event => {
  if (screen !== 'playing') return;
  if (gameKeys.includes(event.code)) event.preventDefault();
  if (event.code === 'KeyP' || event.code === 'Escape') { if (!event.repeat) setPause(!paused); return; }
  if (paused) return;
  keys.add(event.code);
  if (event.code.startsWith('Shift') && !event.repeat) requestDash = true;
  if (event.code === 'KeyQ' && !event.repeat) requestSpecial = true;
  if (event.code === 'KeyE' && !event.repeat) requestJump = true;
  if (event.code === 'KeyR' && !event.repeat) requestReload = true;
  if (event.code === 'KeyV' && !event.repeat) requestInteract = true;
  if (event.code === 'KeyT' && !event.repeat) requestMorph = true;
  if (event.code === 'KeyG' && !event.repeat) requestMimic = true;
  if(event.code==='KeyI'&&!event.repeat)requestInvisible=true;
  if(event.code==='KeyH'&&!event.repeat)requestClone=true;
  if(event.code==='KeyM'&&!event.repeat)requestMerge=true;
});
window.addEventListener('keyup', event => { keys.delete(event.code); });
window.addEventListener('blur', () => { clearInput(); setPause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); setPause(true); } });
function updateJoystick(event) {
  const box = $('joystick').getBoundingClientRect();
  const dx = event.clientX - box.left - box.width / 2;
  const dy = event.clientY - box.top - box.height / 2;
  const radius = box.width * .31;
  const length = Math.hypot(dx, dy);
  const factor = Math.max(1, length / radius);
  joystick.x = dx / factor / radius;
  joystick.y = dy / factor / radius;
  $('joystick-knob').style.transform = `translate(${dx / factor}px, ${dy / factor}px)`;
}
$('joystick').addEventListener('pointerdown', event => {
  event.preventDefault();
  joystick.active = true; joystick.id = event.pointerId;
  pointer.active = false;
  $('joystick').setPointerCapture(event.pointerId);
  updateJoystick(event);
});
$('joystick').addEventListener('pointermove', event => { if (joystick.active && joystick.id === event.pointerId) updateJoystick(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('joystick').addEventListener(type, () => {
  joystick.active = false; joystick.x = joystick.y = 0;
  $('joystick-knob').style.transform = 'translate(0, 0)';
});
$('attack-touch').addEventListener('pointerdown', event => {
  event.preventDefault(); touchAttack = true; pointer.active = false;
  $('attack-touch').setPointerCapture(event.pointerId);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('attack-touch').addEventListener(type, () => { touchAttack = false; });
$('dash-touch').addEventListener('pointerdown', event => { event.preventDefault(); requestDash = true; });
$('special-touch').addEventListener('pointerdown', event => { event.preventDefault(); requestSpecial = true; });
$('aim-touch')?.addEventListener('click', () => { focusAim = !focusAim; $('aim-touch').setAttribute('aria-pressed', String(focusAim)); pointer.active = false; });
$('crouch-touch')?.addEventListener('click', () => { touchCrouch = !touchCrouch; $('crouch-touch').setAttribute('aria-pressed', String(touchCrouch)); });
$('block-touch')?.addEventListener('pointerdown', event => { event.preventDefault(); touchBlock = true; $('block-touch').setPointerCapture(event.pointerId); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('block-touch')?.addEventListener(type, () => { touchBlock = false; });
$('jump-touch')?.addEventListener('pointerdown', event => { event.preventDefault(); requestJump = true; });
$('reload-touch')?.addEventListener('pointerdown', event => { event.preventDefault(); requestReload = true; });
$('interact-touch')?.addEventListener('pointerdown', event => { event.preventDefault(); requestInteract = true; });
$('morph-touch')?.addEventListener('pointerdown', event => { event.preventDefault(); requestMorph = true; });
$('morph-form')?.addEventListener('click', () => { requestMorph = true; canvas.focus({preventScroll:true}); });
$('mimic-form')?.addEventListener('click', () => { requestMimic = true; canvas.focus({preventScroll:true}); });
for(const [id,command] of [['invisible-form','invisible'],['clone-form','clone'],['merge-form','merge'],['invisible-touch','invisible'],['echo-touch','clone'],['merge-touch','merge'],['mimic-touch','mimic']])$(id)?.addEventListener('click',()=>{if(command==='invisible')requestInvisible=true;if(command==='clone')requestClone=true;if(command==='merge')requestMerge=true;if(command==='mimic')requestMimic=true;canvas.focus({preventScroll:true});});
$('create-custom-form')?.addEventListener('click',()=>{requestCustomForm={name:$('custom-form-name').value.trim()||'Custom Creator',material:$('custom-form-material').value,color:$('custom-form-color').value,scale:Number($('custom-form-scale').value)};canvas.focus({preventScroll:true});});

function getInput() {
  const moveX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + joystick.x + (controller.moveX || 0);
  const moveY = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + joystick.y + (controller.moveY || 0);
  let aimX = pointer.x, aimY = pointer.y;
  if (!pointer.active) {
    const targets=game.competitive?(game.players||[]).filter(player=>player.id!==game.player.id&&player.hp>0&&(game.mode==='ffa'||player.team!==game.player.team)):game.enemies;
    const enemy = targets.reduce((best, current) => !best || Math.hypot(current.x - game.player.x, current.y - game.player.y) < Math.hypot(best.x - game.player.x, best.y - game.player.y) ? current : best, null);
    if (enemy) { aimX = enemy.x; aimY = enemy.y; }
    else { aimX = game.player.x + (moveX || 1) * 100; aimY = game.player.y + moveY * 100; }
  }
  if (controller.connected && Math.hypot(controller.aimX, controller.aimY) > .05) { aimX = game.player.x + controller.aimX * 600; aimY = game.player.y + controller.aimY * 600; }
  const input = { moveX, moveY, aimX, aimY, attack: pointer.down || keys.has('Space') || touchAttack || controller.attack, dash: requestDash || controller.dash, special: requestSpecial || controller.special, aim: focusAim || controller.aim, crouch: keys.has('KeyC') || touchCrouch || controller.crouch, block: keys.has('KeyF') || touchBlock || controller.block, jump: requestJump || controller.jump, reload: requestReload || controller.reload, interact: requestInteract || controller.interact, morph:requestMorph||controller.morph, mimic:requestMimic, invisible:requestInvisible||controller.invisible, clone:requestClone||controller.clone, merge:requestMerge||controller.merge };
  if(requestCustomForm)input.customForm=requestCustomForm;
  for (const key of ['attack','dash','special','aim','crouch','block','jump','reload','interact','morph','mimic','invisible','clone','merge']) input[key] = Boolean(input[key]);
  requestDash = requestSpecial = false;
  requestJump = requestReload = false;
  requestInteract = false;
  requestMorph = requestMimic = false;
  requestInvisible=requestClone=requestMerge=false;requestCustomForm=null;
  return input;
}

function updateHud() {
  const p = game.player;
  $('health-fill').style.width = `${100 * Math.max(0, p.hp) / p.maxHp}%`;
  $('health-text').textContent = game.classId === 'creator' ? 'INVINCIBLE' : `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`;
  $('mana-fill').style.width = `${100 * p.energy / p.maxEnergy}%`;
  $('mana-text').textContent = game.classId === 'creator' ? 'UNLIMITED' : `${Math.floor(p.energy)} / ${p.maxEnergy}`;
  $('wave').textContent = `${game.wave} / 5`;
  $('wave').parentElement.querySelector('.number-label').textContent=game.competitive?'TIME':'WAVE';
  if(game.competitive)$('wave').textContent=`${Math.ceil(game.matchTime)}s`;
  $('score').textContent = game.score.toLocaleString();
  $('essence').textContent = game.essence;
  $('class-label').textContent = CLASSES[game.classId].name;
  const cooldown = Math.max(0, p.specialCooldown);
  $('ability-label').textContent = cooldown > 0 ? `Q · ${cooldown.toFixed(1)}s` : `Q · ${CLASSES[game.classId].special}`;
  $('dash-label').textContent = p.dashCooldown > 0 ? `Dash · ${p.dashCooldown.toFixed(1)}s` : 'Shift · Dash ready';
  $('special-touch').classList.toggle('on-cooldown', cooldown > 0 || p.energy < 30);
  $('dash-touch').classList.toggle('on-cooldown', p.dashCooldown > 0);
  if ($('movement-label')) $('movement-label').textContent = [p.jumpTime > 0 ? 'Airborne' : p.blocking ? 'Guarding' : p.crouching ? 'Crouched' : focusAim ? 'Focused aim' : 'Ready', p.weaponId === 'rifle' ? (p.reloadTime > 0 ? `Reloading ${p.reloadTime.toFixed(1)}s` : `Rifle ${p.ammo} / ${p.maxAmmo}`) : WEAPONS[p.weaponId]?.name || CLASSES[game.classId].weapon].join(' · ');
  if($('form-label'))$('form-label').textContent=game.classId==='creator'?getForm(p).name+' FORM':'HUMAN FIGHTER';
  for(const id of ['morph-form','morph-touch','mimic-form','create-custom-form','invisible-form','clone-form','merge-form','invisible-touch','echo-touch','merge-touch','mimic-touch'])if($(id))$(id).disabled=game.classId!=='creator'||screen!=='playing'||paused;
  if($('lab-status'))$('lab-status').textContent=`${p.invisible?'Invisible':'Visible'} · Scale ${(p.scale||1).toFixed(1)} · Echoes ${(game.echoes||[]).length} / 12 · Created ${game.echoesCreated||0}`;
  $('contract-title').textContent = CONTRACTS[game.contract.id].name;
  $('contract-progress').textContent = game.contract.completed ? 'Complete · bonus gold secured' : `${Math.floor(game.contract.progress)} / ${game.contract.target}`;
  const seconds = Math.max(0, 90 - Math.floor(game.time));
  $('objective').textContent = game.mode === 'relic' ? `Recover relics · ${game.relics || 0} / 12` : game.mode === 'trial' ? `Sun trial · ${seconds}s · ${game.score} / ${MODES.trial.target}` : `Defend Heaven · Wave ${game.wave} of 5`;
  if(game.competitive){
    $('objective').textContent=game.mode==='ctf'?`Capture the flag · ${game.teamScores.sun} — ${game.teamScores.moon} / 3`:game.mode==='ffa'?`Free for all · ${p.kills||0} / 10 eliminations`:`War zone · ${game.zone.owner?game.zone.owner.toUpperCase()+' controls':'Contested / open'}`;
    $('scoreboard').hidden=false;
    $('team-score').textContent=game.mode==='ffa'?'Every fighter for themselves':`SUN ${game.teamScores.sun} : ${game.teamScores.moon} MOON`;
    $('scoreboard-list').replaceChildren();
    for(const player of [...game.players].sort((a,b)=>(b.kills||0)-(a.kills||0))){
      const row=document.createElement('li');row.textContent=`${player.name}${player.id===p.id?' · YOU':''} · ${game.mode==='ffa'?'solo':player.team||'solo'} · ${player.kills||0} K / ${player.deaths||0} D${player.hp<=0?' · respawning':''}`;
      $('scoreboard-list').append(row);
    }
  }else $('scoreboard').hidden=true;
  if ($('mechanism-status') && game.mechanism) $('mechanism-status').textContent = game.mechanism.unlocked ? 'Golden gate unlocked · +250 glory' : `Gate engine · ${Math.floor(game.mechanism.charge * 100)}% · Pull both gold levers (V)`;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const rail=document.querySelector('.arena-rail');
  if(rail){rail.style.maxHeight=window.innerWidth>620&&$('menu').hidden?`${rect.height}px`:'';rail.style.overflowY=window.innerWidth>620&&$('menu').hidden?'auto':'';}
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const scale = Math.min(rect.width / 1200, rect.height / 800);
  view = { width: rect.width, height: rect.height, scale, x: (rect.width - 1200 * scale) / 2, y: (rect.height - 800 * scale) / 2, dpr };
}
new ResizeObserver(resize).observe(canvas);
function line(points, color, width = 1) {
  ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function ellipse(x, y, rx, ry, fill, stroke) {
  ctx.beginPath(); ctx.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,Math.PI*2);
  if (fill) { ctx.fillStyle=fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle=stroke; ctx.stroke(); }
}
function glow(x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x,y,0,x,y,radius);
  gradient.addColorStop(0,color); gradient.addColorStop(1,'transparent');
  ctx.fillStyle=gradient; ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
}
function buildBackground() {
  const offscreen = document.createElement('canvas'); offscreen.width=1200; offscreen.height=800;
  const b = offscreen.getContext('2d');
  const colors = game.realm === 'fields' ? ['#254248','#0b1f2c','#efe2ab'] : game.realm === 'sands' ? ['#2b2026','#15151f','#c9a071'] : game.realm === 'duat' ? ['#122f34','#09131f','#64d9c1'] : ['#162b46','#091525','#d5b075'];
  const gradient=b.createRadialGradient(600,280,40,600,400,750);
  gradient.addColorStop(0,colors[0]); gradient.addColorStop(1,colors[1]);
  b.fillStyle=gradient; b.fillRect(0,0,1200,800);
  let random=32;
  const rng=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
  for(let i=0;i<190;i++) { b.fillStyle=`rgba(219,226,241,${.12+rng()*.45})`; b.beginPath(); b.arc(rng()*1200,rng()*800,rng()*1.3+.3,0,Math.PI*2); b.fill(); }
  b.strokeStyle='#789eaa13'; b.lineWidth=1;
  for(let x=-800;x<1800;x+=90) {b.beginPath();b.moveTo(x,0);b.lineTo(x+800,800);b.stroke();b.beginPath();b.moveTo(x,0);b.lineTo(x-800,800);b.stroke();}
  b.fillStyle='#09121d66'; b.fillRect(28,26,1144,748);
  b.strokeStyle=colors[2]+'55'; b.lineWidth=2; b.strokeRect(30,28,1140,744); b.strokeRect(43,41,1114,718);
  for(const radius of [118,132,200,210,300]) {b.beginPath();b.arc(600,400,radius,0,Math.PI*2);b.strokeStyle=colors[2]+(radius<220?'25':'12');b.stroke();}
  for(let i=0;i<16;i++){const a=i*Math.PI/8; b.beginPath();b.moveTo(600+Math.cos(a)*132,400+Math.sin(a)*132);b.lineTo(600+Math.cos(a)*195,400+Math.sin(a)*195);b.strokeStyle=colors[2]+'20';b.stroke();}
  // Original solar-wing floor emblem, drawn locally with no image dependencies.
  b.save();b.translate(600,400);b.strokeStyle=colors[2]+'35';b.lineWidth=2;
  for(const side of [-1,1]) for(let i=0;i<7;i++){b.beginPath();b.moveTo(side*26,-10+i*3);b.quadraticCurveTo(side*(80+i*9),-70+i*6,side*(104+i*11),-50+i*17);b.quadraticCurveTo(side*75,30,side*24,12);b.stroke();}
  b.beginPath();b.arc(0,0,25,0,Math.PI*2);b.stroke(); b.restore();
  // Heaven's gate, protected by the angel, at the north of the arena.
  const portal=b.createRadialGradient(600,70,0,600,70,100);portal.addColorStop(0,'#f4d99a44');portal.addColorStop(1,'transparent');b.fillStyle=portal;b.fillRect(490,0,220,180);
  for(const x of [516,666]) { b.fillStyle='#172738';b.fillRect(x,18,18,105);b.fillStyle=colors[2];b.fillRect(x-4,16,26,8);b.fillRect(x-4,115,26,8); }
  b.strokeStyle=colors[2]; b.lineWidth=5; b.beginPath();b.moveTo(524,20);b.quadraticCurveTo(600,-4,675,20);b.stroke();
  b.fillStyle='#e6d6b7';b.font='10px sans-serif';b.textAlign='center';b.letterSpacing='3px';b.fillText('THE GATES OF HEAVEN',600,150);
  for(const [x,y] of [[70,70],[1130,70],[70,730],[1130,730]]) {
    b.fillStyle='#152333';b.fillRect(x-12,y-22,24,42);b.strokeStyle=colors[2]+'80';b.strokeRect(x-12,y-22,24,42);
    b.beginPath();b.moveTo(x-12,y-22);b.lineTo(x,y-39);b.lineTo(x+12,y-22);b.fillStyle=colors[2]+'aa';b.fill();
    b.fillStyle=colors[2];b.font='18px serif';b.fillText('☥',x,y+6);
  }
  background=offscreen; backgroundRealm=game.realm;
}
function drawObstacles() {
  for(const o of game.obstacles) {
    ctx.fillStyle='#00000044';ctx.fillRect(o.x+7,o.y+9,o.w,o.h);
    const fill=ctx.createLinearGradient(o.x,o.y,o.x+o.w,o.y+o.h);fill.addColorStop(0,'#365060');fill.addColorStop(1,'#172b3b');
    ctx.fillStyle=fill;ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeStyle='#bfac7966';ctx.lineWidth=2;ctx.strokeRect(o.x,o.y,o.w,o.h);
    ctx.fillStyle='#91b6bd22';ctx.fillRect(o.x+4,o.y+4,o.w-8,5);
    ctx.strokeStyle='#cfb88166';ctx.lineWidth=1;
    const cx=o.x+o.w/2,cy=o.y+o.h/2;ellipse(cx,cy-5,4,5,null,'#cfb88177');line([[cx,cy],[cx,cy+10]],'#cfb88177');line([[cx-7,cy+3],[cx+7,cy+3]],'#cfb88177');
  }
}
function drawMechanism() {
  const m=game.mechanism;
  if(!m)return;
  const gold=m.unlocked?'#9af1cf':'#dbb76c';
  for(const [i,lever] of m.levers.entries()) {
    const direction=i===0?1:-1;
    const px=lever.x+direction*125,py=lever.y-95;
    line([[lever.x,lever.y-12],[px,lever.y-12],[px,py],[600,400]],lever.on?'#d8be7899':'#b09a5633',3);
    ctx.save();ctx.translate(px,py);ctx.rotate(m.angle*direction);ellipse(0,0,17,17,'#192f39',gold);ellipse(0,0,9,9,null,gold);
    for(let j=0;j<6;j++){const a=j*Math.PI/3;line([[Math.cos(a)*5,Math.sin(a)*5],[Math.cos(a)*15,Math.sin(a)*15]],gold,2);}ctx.restore();
    ellipse(lever.x,lever.y+4,22,12,'#0c1724',gold);
    line([[lever.x,lever.y],[lever.x+(lever.on?15:-15),lever.y-30]],gold,5);
    ellipse(lever.x+(lever.on?15:-15),lever.y-30,6,6,lever.on?'#a5edcf':'#f1d796');
    ctx.textAlign='center';ctx.fillStyle='#c8c9b2';ctx.font='11px sans-serif';ctx.fillText(lever.on?'LEVER · ENGAGED':'GOLDEN LEVER',lever.x,lever.y+30);
    if(Math.hypot(game.player.x-lever.x,game.player.y-lever.y)<85){ctx.fillStyle='#fff1b4';ctx.font='bold 13px sans-serif';ctx.fillText('V · PULL LEVER',lever.x,lever.y-48);}
  }
  line([[600,400],[600,170]],gold+'66',3);
  ctx.save();ctx.translate(600,400);ctx.rotate(m.angle);
  const metal=ctx.createLinearGradient(-75,-75,75,75);metal.addColorStop(0,'#f4dd98');metal.addColorStop(.3,'#8e7139');metal.addColorStop(.55,'#e5c26d');metal.addColorStop(.8,'#675932');metal.addColorStop(1,'#e5c688');
  ctx.lineWidth=9;ellipse(0,0,69,69,null,metal);ctx.lineWidth=2;ellipse(0,0,57,57,null,'#ead79a66');
  for(let i=0;i<8;i++){const a=i*Math.PI/4;line([[Math.cos(a)*17,Math.sin(a)*17],[Math.cos(a)*65,Math.sin(a)*65]],metal,6);ellipse(Math.cos(a)*70,Math.sin(a)*70,4,4,'#fff0b8');}
  ellipse(0,0,18,18,metal,'#fff3c1');ctx.restore();
  for(const radius of [80,86,94]){ctx.lineWidth=1;ellipse(600,400,radius,radius,null,'#d9c18222');}
  ctx.fillStyle='#152833';ctx.fillRect(588,164,24,22);ctx.strokeStyle=gold;ctx.lineWidth=2;ctx.strokeRect(588,164,24,22);
  ctx.beginPath();ctx.arc(m.unlocked?607:600,164,8,Math.PI,0);ctx.stroke();ellipse(600,175,2,3,gold);
}
function drawBattleObjectives(time){
  if(!game.competitive)return;
  if(game.mode==='warzone'){
    const z=game.zone,color=z.owner==='sun'?'#efd28b':z.owner==='moon'?'#9aaeff':'#b9e6da';
    ctx.fillStyle=color+'12';ellipse(z.x,z.y,z.r,z.r,color+'12',color+'aa');
    ctx.save();ctx.translate(z.x,z.y);ctx.rotate(time*.1);ctx.setLineDash([12,10]);ctx.lineWidth=3;ellipse(0,0,z.r-8,z.r-8,null,color);ctx.setLineDash([]);ctx.restore();
    ctx.fillStyle=color;ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('WAR ZONE · HOLD THE CIRCLE',z.x,z.y+z.r+22);
  }
  if(game.mode==='ctf')for(const flag of game.flags){
    const color=flag.team==='sun'?'#efd28b':'#a6b4ff';
    glow(flag.homeX,flag.homeY,80,color+'22');ellipse(flag.homeX,flag.homeY,47,47,null,color+'aa');
    const carrier=game.players.find(player=>player.id===flag.carrierId),x=carrier?carrier.x+25:flag.x,y=carrier?carrier.y-20:flag.y;
    line([[x,y+16],[x,y-38]],'#dfd8ba',3);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y-38);ctx.lineTo(x+32,y-30);ctx.lineTo(x,y-18);ctx.closePath();ctx.fill();
    ctx.fillStyle=color;ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(flag.team.toUpperCase()+' FLAG',flag.homeX,flag.homeY+67);
  }
}
function drawPlayer(time, p = game.player) {
  const owner=(p.classId||game.classId)==='creator';
  const form=owner?(p.form==='custom'?getForm(p).material:p.form||'light'):null;
  if(p.invisible&&p.id!==game.player.id&&p!==game.player&&(game.mode==='ffa'||p.team!==game.player.team))return;
  const look=form==='mimic'&&p.disguise?p.disguise:p;
  const classId=look.classId||game.classId;
  const material=owner?getForm(p):null;
  const color=material?.color||look.accentColor||CLASSES[classId].color;
  const outfit=look.outfit||'royal';
  const weapon=look.weaponId||p.weaponId||'blade';
  const angle=Number.isFinite(p.facing)?p.facing:0;
  const flap=Math.sin(time*5)*4;
  ellipse(p.x,p.y+20,27,10,'#00000055');
  if(p.team){const team=look.team||p.team;ellipse(p.x,p.y+20,31,13,null,team==='sun'?'#efd18aaa':team==='moon'?'#a6b4ffaa':'#bde7d688');}
  glow(p.x,p.y,owner?90:55,color+'20');
  ctx.save();ctx.translate(p.x,p.y-(p.jumpTime>0?Math.sin(p.jumpTime/.45*Math.PI)*32:0));ctx.rotate(angle+Math.PI/2);
  ctx.scale(p.scale||1,p.scale||1);
  if(p.invisible)ctx.globalAlpha*=.22;
  if(p.crouching)ctx.scale(.82,.82);
  if(p.hitFlash>0)ctx.globalAlpha=.55;
  if(form==='smoke'||form==='cloud'){
    for(let i=0;i<14;i++){const a=i*2.39+time*.45;const r=15+(i%4)*9;ellipse(Math.cos(a)*r,Math.sin(a)*r,17+Math.sin(time+i)*4,12,form==='smoke'?'#a3a8bd28':'#e2f6ff55');}
    ctx.globalAlpha*=.65;
  }
  if(form==='water'){
    for(let i=0;i<4;i++){ctx.lineWidth=2;ellipse(0,8+i*7,30+i*7,12+i*3,null,'#8aefff66');}
  }
  if(form==='fire'){
    for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.save();ctx.rotate(a);const length=38+Math.sin(time*9+i)*14;ctx.beginPath();ctx.moveTo(-9,16);ctx.quadraticCurveTo(-15,length,0,length+15);ctx.quadraticCurveTo(12,length,9,16);ctx.fillStyle=i%2?'#ffc15b88':'#fb6a4055';ctx.fill();ctx.restore();}
  }
  if(form==='hero'||outfit==='traveler'){
    ctx.fillStyle=form==='hero'?'#a93e4e':look.accentColor||'#8b7157';ctx.beginPath();ctx.moveTo(-17,-8);ctx.quadraticCurveTo(-36,25,-36,57);ctx.lineTo(0,49);ctx.lineTo(35,57);ctx.quadraticCurveTo(33,18,17,-8);ctx.fill();
  }else if(owner||outfit==='robe'||outfit==='royal'){
    for(const side of [-1,1])for(let i=6;i>=0;i--){const out=22+i*5,up=-6+i*2+flap;ctx.beginPath();ctx.moveTo(side*8,5);ctx.quadraticCurveTo(side*out*.75,-28-i*2,side*out,up-12);ctx.quadraticCurveTo(side*(out-3),up+8,side*8,16);ctx.fillStyle=owner&&form!=='mimic'?color+(i%2?'bb':'66'):i%2?'#e8e2cc':'#b9cccf';ctx.fill();ctx.strokeStyle='#ffffff33';ctx.lineWidth=.7;ctx.stroke();}
  }
  let body=look.primaryColor||'#314a61';
  if(owner&&form!=='mimic')body=form==='hero'?'#285a8e':color;
  if(form==='gold'){const g=ctx.createLinearGradient(-18,-10,22,28);g.addColorStop(0,'#fff1ad');g.addColorStop(.35,'#9a6d24');g.addColorStop(.6,'#edc468');g.addColorStop(1,'#ffe7a5');body=g;for(let i=0;i<4;i++)ellipse(Math.sin(time*2+i)*23,23+(time*18+i*8)%21,3,5,'#e5bb6999');}
  line([[-7,14],[-9,34]],body,10);line([[7,14],[9,34]],body,10);
  ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-17,-8);ctx.lineTo(17,-8);ctx.lineTo(11,18);ctx.lineTo(0,23);ctx.lineTo(-11,18);ctx.closePath();ctx.fill();
  if(outfit==='robe'){ctx.beginPath();ctx.moveTo(-10,8);ctx.lineTo(18,38);ctx.lineTo(-18,38);ctx.closePath();ctx.fill();}
  const accent=owner&&form!=='mimic'?'#fff2be':look.accentColor||'#e2c17d';
  line([[-17,-5],[-22,12]],body,8);line([[17,-5],[22,12]],body,8);
  if(outfit==='battle'||outfit==='royal'){ellipse(-16,-8,8,6,accent);ellipse(16,-8,8,6,accent);}
  if(outfit==='traveler'){ctx.fillStyle='#816849';ctx.fillRect(-22,9,9,12);}
  ctx.fillStyle=accent;ctx.fillRect(-11,10,22,4);ctx.fillRect(-2,-7,4,20);
  ellipse(0,-19,10,12,owner&&form!=='mimic'?form==='hero'?'#c79976':body:'#c79976');
  // A human face and beard distinguish the Creator from the masked fighters.
  if(owner&&form!=='mimic'){
    ctx.fillStyle=form==='hero'?'#172432':'#c4bda6';ctx.beginPath();ctx.arc(0,-23,11,Math.PI,Math.PI*2);ctx.lineTo(10,-21);ctx.lineTo(-10,-21);ctx.fill();
    ctx.fillStyle=form==='hero'?'#263447':'#c7b99c';ctx.beginPath();ctx.moveTo(-7,-12);ctx.lineTo(0,-4);ctx.lineTo(7,-12);ctx.fill();
    ellipse(-4,-19,1.5,1.5,'#f4fff2');ellipse(4,-19,1.5,1.5,'#f4fff2');
    ctx.lineWidth=2;ellipse(0,-38,15,5,null,accent);
    if(form==='light'){glow(0,-12,65,'#fff6bf55');for(let i=0;i<8;i++){const a=i*Math.PI/4+time*.2;line([[Math.cos(a)*49,Math.sin(a)*49],[Math.cos(a)*58,Math.sin(a)*58]],'#fff4bc77',1);}}
  }else if(outfit==='space')ellipse(0,-19,13,14,'#304b6699',accent);
  else if(outfit==='stealth'){ctx.fillStyle='#172c3d';ctx.fillRect(-9,-18,18,10);line([[-7,-19],[7,-19]],accent,2);}
  else{ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(-12,-21);ctx.lineTo(-8,-33);ctx.lineTo(0,-29);ctx.lineTo(8,-33);ctx.lineTo(12,-21);ctx.closePath();ctx.fill();}
  if(weapon==='blade'||weapon==='dual'){
    for(const side of weapon==='dual'?[-1,1]:[1]){line([[side*20,10],[side*25,-41]],'#e8eef1',4);line([[side*15,-8],[side*31,-8]],accent,3);}
    if(weapon==='blade'&&!owner)ellipse(-21,0,8,13,accent,'#f4e3a1');
  }else if(weapon==='bow'){ctx.beginPath();ctx.arc(14,-15,27,-1.4,1.4);ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.stroke();line([[18,-42],[18,12]],'#d9ead0',1);line([[8,-15],[39,-15]],'#f6e6b6',2);}
  else if(weapon==='rifle'){line([[16,9],[16,-48]],'#afbfc6',6);line([[16,-23],[16,-58]],accent,3);line([[12,-21],[22,-21]],'#76e9dc',5);if(p.aiming){line([[16,-58],[16,-700]],'#86e8d64d',1);ellipse(16,-34,4,4,'#b1ffe1');}}
  else if(weapon==='fists'){const punch=p.attackCooldown>.1?15:0;ellipse(-21,-4-(p.combo===1?punch:0),8,9,accent);ellipse(21,-4-(p.combo!==1?punch:0),8,9,accent);}
  else{line([[23,20],[23,-42]],accent,4);ellipse(23,-44,8,8,color);glow(23,-44,22,color+'55');}
  if(p.blocking){ctx.beginPath();ctx.arc(0,0,52,-Math.PI*.89,-Math.PI*.11);ctx.strokeStyle='#a3fae2';ctx.lineWidth=4;ctx.stroke();}
  ctx.restore();
  if((online||game.competitive)&&p.name){ctx.fillStyle=p.hp>0?'#e0f0e5':'#be9ba5';ctx.textAlign='center';ctx.font='12px sans-serif';ctx.fillText((form==='mimic'&&p.disguise?p.disguise.name:p.name)+(p.hp<=0?game.competitive?' · Returning…':' · Fallen':''),p.x,p.y+57);}
}
function drawEnemy(enemy,time) {
  const {x,y,r}=enemy;
  const brute=enemy.type==='brute', ranged=enemy.type==='archer', wisp=enemy.type==='wisp';
  const color=enemy.hitFlash>0?'#fff4d3':(wisp?'#bc97f5':ranged?'#ffbd8d':brute?'#d6698c':'#cf7b9d');
  ellipse(x,y+r*.8,r*1.2,r*.42,'#00000055');
  if(wisp) {
    glow(x,y,r*2,'#ab7cf333');
    ctx.beginPath();ctx.moveTo(x,y-r);ctx.quadraticCurveTo(x+r*1.8,y,x+r*.6,y+r);ctx.lineTo(x,y+r*.6);ctx.lineTo(x-r*.8,y+r*1.4);ctx.quadraticCurveTo(x-r*1.5,y,x,y-r);ctx.fillStyle='#44315e';ctx.fill();ctx.strokeStyle=color;ctx.stroke();
  } else {
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(game.player.y-y,game.player.x-x)+Math.PI/2);
    ctx.fillStyle=brute?'#573245':'#382c46';
    ctx.beginPath();ctx.moveTo(0,-r*1.2);ctx.lineTo(r*.95,-r*.15);ctx.lineTo(r*.7,r);ctx.lineTo(-r*.7,r);ctx.lineTo(-r*.95,-r*.15);ctx.closePath();ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.stroke();
    if(brute) {ctx.fillStyle=color;ctx.fillRect(-r*1.1,-r*.2,r*.5,r*.8);ctx.fillRect(r*.6,-r*.2,r*.5,r*.8);}
    if(ranged) {ctx.beginPath();ctx.arc(r*.6,-2,r*.8,-1.3,1.3);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();}
    ctx.fillStyle='#151421';ctx.fillRect(-r*.45,-r*.5,r*.9,r*.45);
    ctx.restore();
  }
  ellipse(x-r*.19,y-r*.24,2,2,'#ffe4af');ellipse(x+r*.19,y-r*.24,2,2,'#ffe4af');
  if(enemy.hp<enemy.maxHp){ctx.fillStyle='#111622';ctx.fillRect(x-r,y-r-10,r*2,3);ctx.fillStyle=color;ctx.fillRect(x-r,y-r-10,r*2*Math.max(0,enemy.hp/enemy.maxHp),3);}
}
function render(now) {
  const t=now/1000;
  ctx.setTransform(view.dpr,0,0,view.dpr,0,0);ctx.fillStyle='#07111d';ctx.fillRect(0,0,view.width,view.height);
  ctx.translate(view.x,view.y);ctx.scale(view.scale,view.scale);
  if(!background||backgroundRealm!==game.realm)buildBackground();
  ctx.drawImage(background,0,0);
  // The portal and orbiting particles give the arena life before a run starts.
  glow(600,65,60+Math.sin(t)*7,'#ffe7ac1c');
  for(let i=0;i<12;i++){const a=t*.15+i*Math.PI/6;ellipse(600+Math.cos(a)*66,75+Math.sin(a)*26,1.8,1.8,'#e8ca80aa');}
  for(const h of game.hazards||[]){glow(h.x,h.y,h.r||40,'#ca598c1b');ellipse(h.x,h.y,h.r||40,h.r||40,null,'#d06e9c44');}
  drawObstacles();
  drawMechanism();
  drawBattleObjectives(t);
  for(const pickup of game.pickups) {
    const color=pickup.kind==='health'||pickup.kind==='heal'?'#73d3aa':pickup.kind==='energy'?'#75cadd':pickup.kind==='relic'?'#fbdda1':'#c5b1fa';
    const y=pickup.y+Math.sin(t*3+pickup.x)*3;
    glow(pickup.x,y,22,color+'25');
    ctx.save();ctx.translate(pickup.x,y);ctx.rotate(Math.PI/4);ctx.fillStyle=color;ctx.fillRect(-5,-5,10,10);ctx.restore();
    if(pickup.kind==='relic'){ellipse(pickup.x,y-8,5,5,null,color);line([[pickup.x,y-3],[pickup.x,y+8]],color,2);line([[pickup.x-5,y+2],[pickup.x+5,y+2]],color,2);}
  }
  const actors=game.enemies.map(enemy=>({y:enemy.y,draw:()=>drawEnemy(enemy,t)}));
  for(const player of [...(game.players||[game.player]),...(game.echoes||[])])actors.push({y:player.y,draw:()=>{ctx.save();if(player.hp<=0)ctx.globalAlpha=.3;drawPlayer(t,player);ctx.restore();}});
  actors.sort((a,b)=>a.y-b.y).forEach(actor=>actor.draw());
  for(const projectile of game.projectiles) {
    const enemy=projectile.team==='enemy'||projectile.team==='hostile'||projectile.kind==='hostile';
    const color=enemy?'#e38baf':projectile.kind==='arrow'?'#f8d999':'#86f4df';
    const angle=Math.atan2(projectile.vy,projectile.vx);
    line([[projectile.x-Math.cos(angle)*15,projectile.y-Math.sin(angle)*15],[projectile.x,projectile.y]],color,enemy?3:4);
    ellipse(projectile.x,projectile.y,projectile.r||4,projectile.r||4,color);glow(projectile.x,projectile.y,16,color+'33');
  }
  for(const effect of game.effects||[]) {
    const fraction=Math.max(0,Math.min(1,effect.life/(effect.maxLife||.3)));
    const kind=effect.kind||effect.type;
    ctx.save();ctx.globalAlpha=fraction;
    if(kind==='slash') {
      ctx.strokeStyle='#ffedb0';ctx.lineWidth=9*fraction;ctx.beginPath();const a=effect.facing??game.player.facing;ctx.arc(effect.x,effect.y,effect.r||90,a-1,a+1);ctx.stroke();
    } else {ctx.strokeStyle=kind==='heal'?'#6eedba':'#90f8dd';ctx.lineWidth=3;ctx.beginPath();ctx.arc(effect.x,effect.y,(effect.r||45)*(1.2-fraction*.3),0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  for(const p of game.particles){ctx.globalAlpha=Math.max(0,Math.min(1,p.life/(p.maxLife||1)));ellipse(p.x,p.y,p.size||2,p.size||2,p.color||'#efc986');}ctx.globalAlpha=1;
  if(screen==='playing'&&!paused&&pointer.active){ctx.strokeStyle='#f4e1ad99';ctx.lineWidth=1;ellipse(pointer.x,pointer.y,8,8,null,'#f4e1ad99');line([[pointer.x-12,pointer.y],[pointer.x-5,pointer.y]],'#f4e1ad99');line([[pointer.x+5,pointer.y],[pointer.x+12,pointer.y]],'#f4e1ad99');}
  if(game.message&&screen==='playing'){ctx.textAlign='center';ctx.font='600 18px sans-serif';ctx.fillStyle='#f4e4c1';ctx.shadowColor='#05101b';ctx.shadowBlur=10;ctx.fillText(game.message,600,192);ctx.shadowBlur=0;}
  if(screen==='menu'){ctx.fillStyle='#05101b33';ctx.fillRect(0,0,1200,800);}
}
function frame(now) {
  const dt=Math.min(.05,Math.max(0,(now-frameTime)/1000)); frameTime=now;
  controller=readGamepad();
  controllerMenus(controller);
  if ($('controller-status')) $('controller-status').textContent=controller.connected?'Xbox-style controller connected · Menu pauses':'Xbox controller: connect, then press a button';
  if(screen==='playing'&&!paused) {
    const input=getInput();
    if(online) {
      for(const key of ['dash','special','jump','reload','interact','morph','mimic','invisible','clone','merge'])input[key] ||= queuedInput[key];
      input.customForm ||= queuedInput.customForm;
      queuedInput=input;
      if(now>=nextInputAt&&!inputSending){sendRoomInput(queuedInput);queuedInput={};nextInputAt=now+50;}
    } else updateGame(game,dt,input);
    if(game.kills>lastKills){tone(520,.08,'triangle');lastKills=game.kills;}
    if(game.player.hp<lastHp)tone(120,.1,'sawtooth',.025);
    lastHp=game.player.hp;
    if(game.status!=='playing')finishRun();
  }
  hudTime+=dt;if(hudTime>.08){updateHud();hudTime=0;}
  render(now);requestAnimationFrame(frame);
}
$('pause').disabled=true;
updateCareer();updateHud();resize();requestAnimationFrame(frame);
if(!storageWorks)toast('Browser storage is unavailable. Progress lasts for this session.');
if (!inviteCode && new URLSearchParams(location.search).get('practice')==='1') startRun();
