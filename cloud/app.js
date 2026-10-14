import CloudRenderer from './renderer.js';

const $ = (selector) => document.querySelector(selector);
const apiBase = new URL('../api/cloudy/', location.href);
const renderer = new CloudRenderer($('#cloud-canvas'));
const state = { projects: [], currentProject: null, busy: false, motion: !matchMedia('(prefers-reduced-motion: reduce)').matches, shape: 'cloud', atmosphere: 'day', view: 'studio' };
let toastTimer;

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
  try { localStorage.setItem('cloudy-sky', JSON.stringify({ shape: state.shape, atmosphere: state.atmosphere, motion: state.motion, wind: Number($('#wind').value) })); } catch {}
}

function setShape(shape, description) {
  state.shape = renderer.setShape(shape);
  $('#shape-select').value = state.shape;
  $('#shape-name').textContent = state.shape === 'earth' ? 'EARTH · OUR HOME' : state.shape === 'cloud' ? 'CUMULUS 001' : `${state.shape.toUpperCase()} IN THE CLOUDS`;
  $('#shape-description').textContent = state.shape === 'earth' ? 'Ocean, land, and cloud. An illustrated globe.' : description || 'Your imagination, taking shape.';
  $('#earth-open-inline').hidden = state.shape !== 'earth';
  $('#cloud-canvas').setAttribute('aria-label', state.shape === 'earth' ? 'An illustrated Earth globe with blue oceans, green continents, and white clouds' : `An animated cloud sculpture in the shape of a ${state.shape}`);
  savePreferences();
}

function setAtmosphere(atmosphere) {
  if (!['day', 'sunset', 'night'].includes(atmosphere)) return;
  state.atmosphere = atmosphere;
  renderer.setAtmosphere(atmosphere);
  $('#sky').dataset.atmosphere = atmosphere;
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
  state.view = view;
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
    setShape(result.shape, result.intent === 'sculpture' ? result.title : 'A new idea, made real.');
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
$('#shape-select').addEventListener('change', (event) => setShape(event.target.value));
$('#wind').addEventListener('input', (event) => { renderer.setWind(Number(event.target.value)); $('#wind-value').textContent = `${event.target.value}%`; savePreferences(); });
$('#motion-button').addEventListener('click', () => setMotion(!state.motion));
$('#capture-button').addEventListener('click', async () => {
  const image = new Image();
  image.src = renderer.capture();
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  const colors = { day: ['#b9c8ec', '#e6d8ec'], sunset: ['#8285c4', '#efbdb0'], night: ['#151b3d', '#655080'] }[state.atmosphere];
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]);
  context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  canvas.toBlob((blob) => { if (blob) { downloadBlob(blob, `cloudy-${state.shape}.png`); toast('A little piece of your sky, saved.'); } }, 'image/png');
});
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
window.addEventListener('pagehide', (event) => { if (!event.persisted) renderer.dispose(); });

try {
  const preferences = JSON.parse(localStorage.getItem('cloudy-sky') || '{}');
  if (preferences.shape) setShape(preferences.shape);
  if (preferences.atmosphere) setAtmosphere(preferences.atmosphere);
  if (typeof preferences.motion === 'boolean') setMotion(preferences.motion);
  if (Number.isFinite(preferences.wind)) { $('#wind').value = preferences.wind; $('#wind-value').textContent = `${preferences.wind}%`; }
} catch {}
const requestedShape = new URLSearchParams(location.search).get('shape') || window.CLOUDY_INITIAL_SHAPE;
if (requestedShape) setShape(requestedShape);
renderer.setAtmosphere(state.atmosphere);
renderer.setWind(Number($('#wind').value));
setMotion(state.motion);
Promise.all([loadProjects(), updateStatus()]).catch(() => {
  $('#prompt-status').textContent = 'The cloud canvas is ready. Start the Cloudy server to build and save apps.';
  toast('Workspace connection unavailable. The cloud canvas still works.');
});
