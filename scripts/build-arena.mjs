import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Build an offline, browser-openable game without adding a bundler dependency.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public/arena');
const output = path.join(root, 'dist/Heavenward.html');
const [html, css, core, app, gamepad, peerRoom, peerLibrary] = await Promise.all(
  ['index.html', 'styles.css', 'core.mjs', 'app.js', 'gamepad.mjs', 'peer-room.mjs', 'vendor/peerjs.min.js'].map(file => readFile(path.join(source, file), 'utf8')),
);
const gamepadModule = `const { createGamepadReader } = (() => {\n${gamepad.replace(/^export /gm, '')}\nreturn { createGamepadReader };\n})();\n`;
const peerModule = `const { createPeerRoom, joinPeerRoom } = (() => {\n${peerRoom.replace(/^import .*\n/gm, '').replace(/^export /gm, '')}\nreturn { createPeerRoom, joinPeerRoom };\n})();\n`;
const script = ('window.HEAVENWARD_STATIC = true;\n' + core.replace(/^export /gm, '') + '\n' + gamepadModule + peerModule + app.replace(/^import .* from '\.\/(core|gamepad|peer-room)\.mjs';\n/gm, '')).replace(/<\/script/gi, '<\\/script');
if (/^import /m.test(script)) throw new Error('Offline game still contains an unresolved import.');
const bundled = html
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>${css}</style>`)
  .replace('<script src="vendor/peerjs.min.js"></script>', () => `<script>\n${peerLibrary.replace(/<\/script/gi, '<\\/script')}\n</script>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script type="module">\n${script}\n</script>`);
if (bundled === html || bundled.includes('src="app.js"')) throw new Error('Game entry point was not bundled.');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, bundled);
await writeFile(path.join(root, 'dist/Heavenward-meta.json'), JSON.stringify({ bytes: Buffer.byteLength(bundled), sha256: createHash('sha256').update(bundled).digest('hex') }));
console.log(`Offline game built: ${output}`);
