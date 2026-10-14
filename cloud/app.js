import CloudRenderer from './renderer.js';

const $ = (selector) => document.querySelector(selector);
const apiBase = new URL('../api/cloudy/', location.href);
const renderer = new CloudRenderer($('#cloud-canvas'));
const state = { projects: [], currentProject: null, busy: false, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches, shape: 'cloud', atmosphere: 'night', view: 'studio', custom: null, journal: [], recording: null, lastVideo: null };
let toastTimer;
try { const stored = JSON.parse(localStorage.getItem('cloudy-morph-journal') || '[]'); if (Array.isArray(stored)) state.journal = stored.filter(entry => entry && typeof entry.id === 'string' && typeof entry.prompt === 'string'); } catch {}

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 5000);
}

async function api(path, options = {}) {
  const response = await fetch(new URL(path, apiBase), {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(35000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Cloudy could not complete that request. Please try again.');
  return body;
}

function savePreferences() {
  try { localStorage.setItem('cloudy-sky', JSON.stringify({ shape: state.shape, custom: state.custom, atmosphere: state.atmosphere, motion: state.motion, wind: Number($('#wind').value), detail: Number($('#detail').value), glitter: $('#glitter').checked })); } catch {}
}

function setShape(shape, description, custom) {
  state.shape = shape === 'custom' && (custom || state.custom) ? renderer.setCustomShape(custom || state.custom) : renderer.setShape(shape);
  state.custom = state.shape === 'custom' ? { ...renderer.customShape } : null;
  if (state.custom) { $('#custom-shape-option').hidden = false; $('#custom-shape-option').textContent = state.custom.label || 'Custom form'; }
  $('#shape-select').value = state.shape;
  $('#shape-name').textContent = state.custom ? state.custom.label.toUpperCase() : state.shape === 'earth' ? 'EARTH · OUR HOME' : state.shape === 'cloud' ? 'CUMULUS 001' : `${state.shape.toUpperCase()} IN THE CLOUDS`;
  $('#shape-description').textContent = state.custom ? state.custom.kind === 'text' ? 'Your words, formed from cloud pixels.' : 'A silhouette, shimmering into life.' : state.shape === 'earth' ? 'Ocean, land, and cloud. An illustrated globe.' : description || 'Your imagination, taking shape.';
  $('#earth-open-inline').hidden = state.shape !== 'earth';
  $('#cloud-canvas').setAttribute('aria-label', state.custom ? `A shimmering cloud ${state.custom.kind === 'text' ? 'word sculpture' : 'silhouette'}: ${state.custom.label}` : state.shape === 'earth' ? 'An illustrated Earth globe with blue oceans, green continents, and white clouds' : `An animated cloud sculpture in the shape of a ${state.shape}`);
  savePreferences();
}

function setAtmosphere(atmosphere) {
  if (!['day', 'sunset', 'night'].includes(atmosphere)) return;
  state.atmosphere = atmosphere;
  renderer.setAtmosphere(atmosphere);
  $('#sky').dataset.atmosphere = atmosphere;
  document.body.dataset.atmosphere = atmosphere;
  document.querySelectorAll('[data-atmosphere]').forEach((button) => {
    if (button.tagName !== 'BUTTON') return;
    const selected = button.dataset.atmosphere === atmosphere;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  savePreferences();
}

function setMotion(motion) {
  state.motion = motion;
  renderer.setMotion(motion);
  const button = $('#motion-button');
  button.setAttribute('aria-label', motion ? 'Pause cloud animation' : 'Resume cloud animation');
  button.title = motion ? 'Pause animation' : 'Resume animation';
  button.setAttribute('aria-pressed', String(!motion));
  button.querySelector('use').setAttribute('href', motion ? '#i-pause' : '#i-play');
  savePreferences();
}

function closeNavigation() {
  $('#sidebar').classList.remove('open');
  $('#sidebar-overlay').hidden = true;
  $('#menu-button').setAttribute('aria-expanded', 'false');
}

function setView(view) {
  if (!['studio', 'creations', 'infrastructure'].includes(view)) return;
  if (view !== 'studio' && state.recording) stopRecording();
  state.view = view;
  document.body.classList.toggle('immersive-studio', view === 'studio');
  document.body.classList.remove('scene-focus');
  document.querySelectorAll('main > .view').forEach((section) => { section.hidden = section.id !== `${view}-view`; });
  document.querySelectorAll('.nav-list [data-view]').forEach((button) => {
    const selected = button.dataset.view === view;
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('#breadcrumb-current').textContent = { studio: 'Cloud studio', creations: 'My creations', infrastructure: 'Infrastructure' }[view];
  renderer.setMotion(view === 'studio' && state.motion);
  closeNavigation();
  if (view === 'studio') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function focusPrompt(clear = false) {
  setView('studio');
  if (clear) $('#prompt').value = '';
  $('#prompt').focus();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}

function renderProjects() {
  $('#creation-count').textContent = String(state.projects.length);
  $('#infra-project-count').textContent = String(state.projects.length);
  $('#projects-empty').hidden = state.projects.length > 0;
  const grid = $('#projects-grid');
  grid.replaceChildren();
  for (const project of state.projects) {
    const card = element('article', 'project-card');
    const art = element('div', 'project-art', { 'task-board': '▦', weather: '☀', store: '◈', dashboard: '▤', 'landing-page': '✧', 'ai-generated': '✦' }[project.type] || '✧');
    art.setAttribute('aria-hidden', 'true');
    const details = element('div', 'project-details');
    details.append(element('span', 'card-category', project.type.replaceAll('-', ' ').toUpperCase()));
    details.append(element('h2', '', project.title), element('p', '', project.prompt));
    const actions = element('div', 'project-actions');
    const open = element('button', 'secondary-button', 'Open preview');
    open.append(icon('external'));
    open.addEventListener('click', () => openPreview(project));
    const download = element('button', 'secondary-button');
    download.setAttribute('aria-label', `Export ${project.title}`);
    download.title = 'Export deployment bundle';
    download.append(icon('download'));
    download.addEventListener('click', () => exportProject(project));
    const remove = element('button', 'icon-button');
    remove.setAttribute('aria-label', `Delete ${project.title}`);
    remove.title = 'Delete creation';
    remove.append(icon('trash'));
    remove.addEventListener('click', async () => {
      if (!confirm(`Delete “${project.title}” from your workspace?`)) return;
      try {
        await api(`projects/${project.id}`, { method: 'DELETE' });
        await loadProjects();
        toast('Creation deleted. There is always room for a new idea.');
      } catch (error) { toast(error.message); }
    });
    actions.append(open, download, remove);
    details.append(actions);
    card.append(art, details);
    grid.append(card);
  }
  const previousSelection = $('#hosting-project').value;
  const select = $('#hosting-project');
  select.replaceChildren(new Option(state.projects.length ? 'Choose your creation' : 'Build a creation first', ''));
  for (const project of state.projects) select.add(new Option(project.title, project.id));
  if (state.projects.some((p) => p.id === previousSelection)) select.value = previousSelection;
  else if (state.projects.length === 1) select.value = state.projects[0].id;
  $('#hosting-export').disabled = !select.value;
}

async function loadProjects() {
  const data = await api('projects');
  state.projects = data.projects;
  renderProjects();
}

function openPreview(project) {
  state.currentProject = project;
  $('#preview-title').textContent = project.title;
  $('#preview-frame').src = project.previewUrl;
  $('#preview-dialog').showModal();
}

function openEarthExplorer() {
  closeNavigation();
  const frame = $('#earth-frame');
  if (typeof window.CLOUDY_EARTH_EXPLORER === 'string') {
    frame.srcdoc = window.CLOUDY_EARTH_EXPLORER;
  } else {
    frame.src = new URL('../universal-explorer.html?view=earth', location.href).href;
  }
  renderer.setMotion(false);
  $('#earth-dialog').showModal();
}

function sceneSettings() {
  return { atmosphere: state.atmosphere, wind: Number($('#wind').value), detail: Number($('#detail').value), glitter: $('#glitter').checked, motion: state.motion, cloudParticles: renderer.particles.length, glimmerParticles: renderer.glitterParticles.length, canvas: { width: renderer.canvas.width, height: renderer.canvas.height }, viewport: { width: innerWidth, height: innerHeight } };
}

function persistJournal() {
  try { localStorage.setItem('cloudy-morph-journal', JSON.stringify(state.journal)); } catch { toast('Browser storage is full. Export your journal to keep a copy.'); }
}

function addMorphEntry(prompt, result) {
  const entry = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2), createdAt: new Date().toISOString(), prompt, title: result.title || state.custom?.label || state.shape, shape: result.shape || state.shape, custom: result.custom || state.custom, intent: result.intent || 'sculpture', source: result.source || 'local', message: result.message || $('#shape-description').textContent, project: result.project ? { id: result.project.id, title: result.project.title, type: result.project.type } : undefined, settings: sceneSettings(), notes: '', recordings: [] };
  state.journal.push(entry);
  persistJournal();
  return entry;
}

function ensureCurrentEntry() {
  const last = state.journal.at(-1);
  if (last?.shape === state.shape && (state.shape !== 'custom' || last.custom?.value === state.custom?.value)) return last;
  return addMorphEntry(state.custom?.label || state.shape, { shape: state.shape, title: state.custom?.label || `${state.shape[0].toUpperCase()}${state.shape.slice(1)} sculpture`, custom: state.custom });
}

function selectedEntry() { return state.journal.find(entry => entry.id === $('#document-entry').value) || ensureCurrentEntry(); }
function markdownDocument(entry) {
  const recordings = (entry.recordings || []).map(video => `- ${video.filename}: ${(video.durationMs / 1000).toFixed(1)} seconds, ${video.width} × ${video.height}, ${video.mimeType}, ${video.bytes} bytes`).join('\n') || 'No recordings attached to this morph.';
  const images = (entry.images || []).map(image => `- ${image.filename}: ${image.width} × ${image.height}, ${image.bytes} bytes, saved ${image.savedAt}`).join('\n') || 'No images saved for this morph.';
  return `# ${entry.title}\n\nCreated: ${entry.createdAt}\nRecord: ${entry.id}\n\n## Request\n\n${entry.prompt}\n\n## Result\n\n${entry.message}\n\nShape: ${entry.shape}\nIntent: ${entry.intent}\nCreation engine: ${entry.source}\n${entry.custom ? `Custom form: ${entry.custom.kind} — ${entry.custom.value}\n` : ''}${entry.project ? `App: ${entry.project.title} (${entry.project.id})\n` : ''}\n## Scene settings at creation\n\n${JSON.stringify(entry.settings, null, 2)}\n\n${entry.documentedSettings ? `## Scene when documented\n\n${JSON.stringify(entry.documentedSettings, null, 2)}\n\n` : ''}## Observations\n\n${entry.notes || 'No observations added.'}\n\n## Image records\n\n${images}\n\n## Video records\n\n${recordings}\n\nCloudy renders illustrated cloud, glyph, and word sculptures. JPEG glimmers are visual pixels, not physical nanotechnology. Video captures the canvas artwork without sound or interface controls.\n`;
}

function renderDocument() {
  const entry = selectedEntry();
  $('#document-notes').value = entry.notes || '';
  $('#document-text').textContent = markdownDocument(entry);
  $('#video-download').hidden = !state.lastVideo;
}

function openDocument() {
  closeNavigation();
  const current = ensureCurrentEntry();
  current.documentedSettings = sceneSettings(); persistJournal();
  $('#document-entry').replaceChildren(...[...state.journal].reverse().map(entry => new Option(`${entry.title} · ${new Date(entry.createdAt).toLocaleString()}`, entry.id)));
  $('#document-entry').value = current.id;
  renderDocument();
  $('#document-dialog').showModal();
}

function filenameFor(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'cloudy-morph'; }

function paintScene(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  const colors = { day: ['#b9c8ec', '#d1cff0', '#efe1df'], sunset: ['#8285c4', '#c39ac5', '#efbdb0'], night: ['#151b3d', '#39305c', '#655080'] }[state.atmosphere];
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(.5, colors[1]); gradient.addColorStop(1, colors[2]);
  context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  const scale = Math.min(width / renderer.canvas.width, height / renderer.canvas.height);
  const drawWidth = renderer.canvas.width * scale, drawHeight = renderer.canvas.height * scale;
  context.drawImage(renderer.canvas, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function saveSceneImage() {
  const canvas = document.createElement('canvas');
  canvas.width = renderer.canvas.width; canvas.height = renderer.canvas.height;
  paintScene(canvas.getContext('2d'), canvas.width, canvas.height);
  canvas.toBlob(blob => {
    if (!blob) return;
    const filename = `cloudy-${filenameFor(state.custom?.label || state.shape)}.png`;
    const entry = ensureCurrentEntry(); entry.images ||= [];
    entry.images.push({ filename, savedAt: new Date().toISOString(), width: canvas.width, height: canvas.height, bytes: blob.size });
    persistJournal(); downloadBlob(blob, filename); toast('Your full-resolution cloud image is saved.');
  }, 'image/png');
}

function recorderType() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  return ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function stopRecording() {
  if (state.recording?.recorder.state === 'recording') {
    $('#record-button').disabled = true;
    state.recording.recorder.stop();
  }
}

function toggleRecording() {
  if (state.recording) { stopRecording(); return; }
  const mimeType = recorderType();
  if (mimeType === null) { toast('Video recording is unavailable in this browser. You can still save PNG images and documents.'); return; }
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 1920 / renderer.canvas.width, 1080 / renderer.canvas.height);
  canvas.width = Math.max(2, Math.round(renderer.canvas.width * ratio / 2) * 2);
  canvas.height = Math.max(2, Math.round(renderer.canvas.height * ratio / 2) * 2);
  const context = canvas.getContext('2d');
  let frameId, timer, stream, recorder;
  const chunks = [];
  const started = performance.now();
  const entry = ensureCurrentEntry();
  const recording = { entryIds: new Set([entry.id]) };
  const cleanup = () => {
    cancelAnimationFrame(frameId); clearInterval(timer); stream?.getTracks().forEach(track => track.stop());
    state.recording = null;
    $('#record-button').disabled = false;
    $('#record-button').classList.remove('is-recording');
    $('#record-button').setAttribute('aria-label', 'Start cloud video recording');
    $('#record-button').querySelector('use').setAttribute('href', '#i-record');
    $('#record-button span').textContent = 'Record';
    $('#recording-badge').hidden = true;
  };
  try {
    const composite = () => { paintScene(context, canvas.width, canvas.height); frameId = requestAnimationFrame(composite); };
    composite();
    stream = canvas.captureStream(30);
    recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 5000000 });
    recording.recorder = recorder;
    state.recording = recording;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { cleanup(); toast('This browser could not finish the recording. Try PNG capture or another browser.'); };
    recorder.onstop = () => {
      const durationMs = Math.round(performance.now() - started);
      const type = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunks, { type });
      const filename = `cloudy-${filenameFor(entry.title)}-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      const metadata = { filename, completedAt: new Date().toISOString(), durationMs, mimeType: type, width: canvas.width, height: canvas.height, bytes: blob.size };
      for (const id of recording.entryIds) { const morph = state.journal.find(item => item.id === id); if (morph) { morph.recordings ||= []; morph.recordings.push(metadata); } }
      cleanup();
      if (!blob.size) { toast('The recording was empty. Leave the scene visible and try again.'); return; }
      state.lastVideo = { blob, filename, metadata }; persistJournal();
      downloadBlob(blob, filename); toast(`Video saved · ${(durationMs / 1000).toFixed(1)} seconds. Recording details are in your morph journal.`);
      if ($('#document-dialog').open) renderDocument();
    };
    recorder.start(500);
    $('#record-button').classList.add('is-recording');
    $('#record-button').setAttribute('aria-label', 'Stop and save cloud video');
    $('#record-button').querySelector('use').setAttribute('href', '#i-stop');
    $('#record-button span').textContent = 'Save';
    $('#recording-badge').hidden = false;
    const tick = () => { const seconds = Math.floor((performance.now() - started) / 1000); $('#recording-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; };
    tick(); timer = setInterval(tick, 500);
    toast('Recording your cloud. Morph it while recording, then press Stop & save.');
  } catch { cleanup(); toast('Recording could not start. You can still save an image and your morph document.'); }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = element('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// A portable POSIX tar archive: real source files, no client-side archive dependency.
function deploymentArchive(files) {
  const encoder = new TextEncoder();
  const parts = [];
  function field(header, offset, length, value) { header.set(encoder.encode(value).subarray(0, length), offset); }
  function octal(value, length) { return value.toString(8).padStart(length - 1, '0') + '\0'; }
  for (const [name, content] of Object.entries(files)) {
    const data = encoder.encode(content);
    const header = new Uint8Array(512);
    field(header, 0, 100, name);
    field(header, 100, 8, octal(0o644, 8));
    field(header, 108, 8, octal(0, 8));
    field(header, 116, 8, octal(0, 8));
    field(header, 124, 12, octal(data.length, 12));
    field(header, 136, 12, octal(Math.floor(Date.now() / 1000), 12));
    header.fill(32, 148, 156);
    field(header, 156, 1, '0');
    field(header, 257, 6, 'ustar\0');
    field(header, 263, 2, '00');
    field(header, 265, 32, 'cloudy');
    field(header, 297, 32, 'cloudy');
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    field(header, 148, 8, checksum.toString(8).padStart(6, '0') + '\0 ');
    parts.push(header, data, new Uint8Array((512 - data.length % 512) % 512));
  }
  parts.push(new Uint8Array(1024));
  return new Blob(parts, { type: 'application/x-tar' });
}

async function exportProject(project) {
  if (!project) return;
  toast('Packing your creation for a bigger sky…');
  try {
    const bundle = await api(`projects/${project.id}/bundle`);
    const filename = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'cloudy-creation';
    downloadBlob(deploymentArchive(bundle.files), `${filename}.tar`);
    toast('Your deployment bundle is ready. Start with the included README.');
  } catch (error) { toast(error.message); }
}

async function morph(prompt) {
  if (state.busy) return;
  if (!prompt.trim()) { $('#prompt-status').textContent = 'Give your cloud a few words to work with.'; $('#prompt').focus(); return; }
  state.busy = true;
  $('#morph-button').disabled = true;
  $('#prompt-form').classList.add('loading');
  $('#morph-button span').textContent = 'Creating…';
  $('#prompt-status').textContent = 'A little imagination is taking shape…';
  try {
    const result = await api('morph', { method: 'POST', body: JSON.stringify({ prompt: prompt.trim() }) });
    setShape(result.shape, result.intent === 'sculpture' ? result.title : 'A new idea, made real.', result.custom);
    const entry = addMorphEntry(prompt.trim(), result);
    state.recording?.entryIds.add(entry.id);
    $('#prompt-status').textContent = result.message;
    if (result.project) {
      await loadProjects();
      if (result.intent === 'infrastructure') {
        setView('infrastructure');
        $('#hosting-project').value = result.project.id;
        $('#hosting-export').disabled = false;
        toast('Your hosting starter is ready to preview and export.');
      } else {
        openPreview(result.project);
      }
    }
    await updateStatus();
  } catch (error) {
    $('#prompt-status').textContent = error.name === 'TimeoutError' ? 'That took a little too long. Please try again.' : error.message;
    toast($('#prompt-status').textContent);
  } finally {
    state.busy = false;
    $('#morph-button').disabled = false;
    $('#prompt-form').classList.remove('loading');
    $('#morph-button span').textContent = 'Make it happen';
  }
}

async function updateStatus() {
  const status = await api('status');
  const connected = status.aiMode === 'connected';
  $('#engine-badge').replaceChildren(element('i', 'status-dot'), document.createTextNode(connected ? 'AI creation engine' : 'Local creation engine'));
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) setView(viewButton.dataset.view);
  const promptButton = event.target.closest('[data-prompt]');
  if (promptButton) {
    focusPrompt();
    $('#prompt').value = promptButton.dataset.prompt;
    morph(promptButton.dataset.prompt);
  }
  const atmosphereButton = event.target.closest('button[data-atmosphere]');
  if (atmosphereButton) setAtmosphere(atmosphereButton.dataset.atmosphere);
});
$('#prompt-form').addEventListener('submit', (event) => { event.preventDefault(); morph($('#prompt').value); });
$('#prompt').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#prompt-form').requestSubmit(); } });
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); focusPrompt(); } });
$('#new-creation').addEventListener('click', () => focusPrompt(true));
$('#sidebar-create').addEventListener('click', () => focusPrompt());
$('#command-button').addEventListener('click', () => focusPrompt());
$('#help-button').addEventListener('click', () => { closeNavigation(); $('#help-dialog').showModal(); });
$('#earth-explorer-button').addEventListener('click', openEarthExplorer);
$('#earth-open-inline').addEventListener('click', openEarthExplorer);
$('#earth-dialog').addEventListener('close', () => {
  $('#earth-frame').removeAttribute('srcdoc');
  $('#earth-frame').src = 'about:blank';
  renderer.setMotion(state.motion && state.view === 'studio');
});
$('#controls-button').addEventListener('click', () => $('#controls-dialog').showModal());
$('#shape-select').addEventListener('change', (event) => { setShape(event.target.value); const entry = addMorphEntry(`Select ${state.custom?.label || state.shape}`, { shape: state.shape, custom: state.custom }); state.recording?.entryIds.add(entry.id); });
$('#wind').addEventListener('input', (event) => { renderer.setWind(Number(event.target.value)); $('#wind-value').textContent = `${event.target.value}%`; savePreferences(); });
$('#detail').addEventListener('input', (event) => { renderer.setDetail(Number(event.target.value)); $('#detail-value').textContent = `${event.target.value}%`; savePreferences(); });
$('#glitter').addEventListener('change', () => { renderer.setGlitter($('#glitter').checked); savePreferences(); });
$('#motion-button').addEventListener('click', () => setMotion(!state.motion));
$('#capture-button').addEventListener('click', saveSceneImage);
$('#record-button').addEventListener('click', toggleRecording);
$('#recording-stop').addEventListener('click', stopRecording);
$('#document-button').addEventListener('click', openDocument);
$('#journal-button').addEventListener('click', openDocument);
$('#document-entry').addEventListener('change', renderDocument);
$('#document-notes').addEventListener('input', () => { const entry = selectedEntry(); entry.notes = $('#document-notes').value; persistJournal(); $('#document-text').textContent = markdownDocument(entry); });
$('#document-download').addEventListener('click', () => { const entry = selectedEntry(); downloadBlob(new Blob([markdownDocument(entry)], { type: 'text/markdown;charset=utf-8' }), `cloudy-${filenameFor(entry.title)}.md`); });
$('#journal-download').addEventListener('click', () => downloadBlob(new Blob([JSON.stringify({ platform: 'Cloudy', exportedAt: new Date().toISOString(), morphs: state.journal }, null, 2)], { type: 'application/json' }), 'cloudy-morph-journal.json'));
$('#video-download').addEventListener('click', () => { if (state.lastVideo) downloadBlob(state.lastVideo.blob, state.lastVideo.filename); });
$('#fullscreen-button').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else toast('Your scene already fills the window. Browser fullscreen is unavailable here.'); } catch { toast('The scene fills your window. Fullscreen is unavailable in this browser context.'); } });
document.addEventListener('fullscreenchange', () => { const active = Boolean(document.fullscreenElement); $('#fullscreen-button').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen'); $('#fullscreen-button').title = active ? 'Exit fullscreen' : 'Enter fullscreen'; });
$('#focus-button').addEventListener('click', () => { const hidden = document.body.classList.toggle('scene-focus'); $('#focus-button').setAttribute('aria-label', hidden ? 'Show scene controls' : 'Hide scene controls'); $('#focus-button').setAttribute('aria-pressed', String(hidden)); });
$('#hosting-project').addEventListener('change', () => { $('#hosting-export').disabled = !$('#hosting-project').value; });
$('#hosting-export').addEventListener('click', () => exportProject(state.projects.find((project) => project.id === $('#hosting-project').value)));
$('#preview-export').addEventListener('click', () => exportProject(state.currentProject));
$('#preview-dialog').addEventListener('close', () => { $('#preview-frame').src = 'about:blank'; });
$('#menu-button').addEventListener('click', () => {
  const open = $('#sidebar').classList.toggle('open');
  $('#sidebar-overlay').hidden = !open;
  $('#menu-button').setAttribute('aria-expanded', String(open));
});
$('#sidebar-overlay').addEventListener('click', closeNavigation);
window.addEventListener('pagehide', (event) => { if (state.recording) stopRecording(); if (!event.persisted) renderer.dispose(); });

try {
  const preferences = JSON.parse(localStorage.getItem('cloudy-sky') || '{}');
  if (preferences.shape) setShape(preferences.shape, undefined, preferences.custom);
  if (preferences.atmosphere) setAtmosphere(preferences.atmosphere);
  if (typeof preferences.motion === 'boolean') setMotion(preferences.motion);
  if (Number.isFinite(preferences.wind)) { $('#wind').value = preferences.wind; $('#wind-value').textContent = `${preferences.wind}%`; }
  if (Number.isFinite(preferences.detail)) { $('#detail').value = preferences.detail; $('#detail-value').textContent = `${preferences.detail}%`; }
  if (typeof preferences.glitter === 'boolean') $('#glitter').checked = preferences.glitter;
} catch {}
const requestedShape = new URLSearchParams(location.search).get('shape') || window.CLOUDY_INITIAL_SHAPE;
if (requestedShape) setShape(requestedShape);
setAtmosphere(state.atmosphere);
renderer.setWind(Number($('#wind').value));
renderer.setDetail(Number($('#detail').value));
renderer.setGlitter($('#glitter').checked);
setMotion(state.motion);
Promise.all([loadProjects(), updateStatus()]).catch(() => {
  $('#prompt-status').textContent = 'The cloud canvas is ready. Start the Cloudy server to build and save apps.';
  toast('Workspace connection unavailable. The cloud canvas still works.');
});
