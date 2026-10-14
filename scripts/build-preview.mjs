import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Package the same UI and local creation engine into one browser-openable file.
// The server edition retains server-side persistence and optional AI integration.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(root, 'dist', 'Cloudy-preview.html'));
const initialShape = process.argv[3] || '';
if (initialShape && initialShape !== 'earth') throw new Error('The optional initial shape must be earth.');
const [html, css, rendererSource, appSource, platformSource, explorerSource] = await Promise.all([
  readFile(path.join(root, 'cloud/index.html'), 'utf8'),
  readFile(path.join(root, 'cloud/styles.css'), 'utf8'),
  readFile(path.join(root, 'cloud/renderer.js'), 'utf8'),
  readFile(path.join(root, 'cloud/app.js'), 'utf8'),
  readFile(path.join(root, 'cloudy-platform.js'), 'utf8'),
  readFile(path.join(root, 'universal-explorer.html'), 'utf8'),
]);
const renderer = rendererSource.replace(/^export default CloudRenderer;?\s*$/m, '').replace(/^export /gm, '');
const localEngine = platformSource.slice(0, platformSource.indexOf('export function createCloudyRouter(')).replace(/^import .*\n/gm, '').replace(/^export /gm, '');
if (!localEngine.includes('function generateLocalApp') || !localEngine.includes('function createDeploymentBundle')) throw new Error('Local creation engine exports not found.');

const browserApi = `
let previewProjects = [];
try { previewProjects = JSON.parse(localStorage.getItem('cloudy-browser-projects') || '[]'); if (!Array.isArray(previewProjects)) previewProjects = []; } catch {}
function persistPreviewProjects() { try { localStorage.setItem('cloudy-browser-projects', JSON.stringify(previewProjects)); } catch { toast('This browser cannot retain projects. Export your creation to keep it.'); } }
async function api(route, options = {}) {
  const body = options.body ? JSON.parse(options.body) : {};
  if (route === 'status') return { mode: 'browser', aiMode: 'local', projectCount: previewProjects.length };
  if (route === 'projects') return { projects: [...previewProjects].reverse().map(p => publicProject(p)) };
  if (route === 'morph') {
    if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > MAX_PROMPT) throw new Error('Enter a prompt between 1 and 2,000 characters.');
    const prompt = body.prompt.trim();
    const policyError = contentPolicyViolation(prompt);
    if (policyError) throw new Error(policyError);
    const result = classifyPrompt(prompt);
    if (result.intent === 'sculpture') return { ...result, message: 'Cloudy is taking the shape of a ' + result.shape + '.' };
    const now = new Date().toISOString();
    const id = 'cld_' + (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); }));
    const project = { ...result, id, prompt, source: 'local', createdAt: now, updatedAt: now, html: generateLocalApp({ ...result, prompt }) };
    previewProjects.push(project); persistPreviewProjects();
    return { ...result, project: publicProject(project), message: 'Your working browser preview is ready. Try it and export it to keep a runnable app.' };
  }
  const id = route.split('/')[1];
  const project = previewProjects.find(p => p.id === id);
  if (!project) throw new Error('Creation not found.');
  if (options.method === 'DELETE') { previewProjects = previewProjects.filter(p => p.id !== id); persistPreviewProjects(); return { deleted: id }; }
  if (route.endsWith('/bundle')) return createDeploymentBundle(project);
  throw new Error('This action requires the server edition of Cloudy.');
}
`;
let app = appSource.replace(/^import .*\n/gm, '').replace(/^const apiBase = .*\n/m, '');
const apiStart = app.indexOf('async function api(');
const apiEnd = app.indexOf('function savePreferences()', apiStart);
if (apiStart < 0 || apiEnd < 0) throw new Error('Browser API replacement boundaries not found.');
app = app.slice(0, apiStart) + browserApi + '\n' + app.slice(apiEnd);
app = app.replace("$('#preview-frame').src = project.previewUrl;", "$('#preview-frame').srcdoc = previewProjects.find(p => p.id === project.id)?.html || '';" );
app = app.replace("$('#preview-frame').src = 'about:blank';", "$('#preview-frame').removeAttribute('srcdoc'); $('#preview-frame').src = 'about:blank';");
app = app.replaceAll('Local creation engine', 'Browser creation engine');
const embeddedExplorer = explorerSource.replace('</head>', '<script>window.CLOUDY_EARTH_MODE = true;</script></head>');
const explorerSetup = `window.CLOUDY_EARTH_EXPLORER = ${JSON.stringify(embeddedExplorer).replace(/</g, '\\u003c')};\nwindow.CLOUDY_INITIAL_SHAPE = ${JSON.stringify(initialShape)};`;
const script = `${explorerSetup}\n${localEngine}\n${renderer}\n${app}`.replace(/<\/script/gi, '<\\/script');
let preview = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>${css}</style>`).replace('  <script type="module" src="app.js"></script>', '');
preview = preview.replace('href="./"', 'href="#"').replaceAll('Local creation engine', 'Browser creation engine').replaceAll('Local environment', 'Browser workspace').replace('Local runtime', 'Browser runtime').replace('<strong>Node.js</strong>', '<strong>Browser</strong>').replace('Running in your workspace', 'Running on this device').replace('Saved to this environment', 'Saved in this browser');
preview = preview.replace('</body>', () => `<script>${script}</script>\n</body>`);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, preview);
console.log(`Browser preview built: ${output}`);
