import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { classifyPrompt, contentPolicyViolation, createCloudyRouter } from '../cloudy-platform.js';

async function fixture(t, options = {}) {
  const stateDirectory = options.stateDirectory || await mkdtemp(path.join(tmpdir(), 'cloudy-test-'));
  if (!options.stateDirectory) t.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const app = express();
  app.use('/api/cloudy', createCloudyRouter({ aiApiKey: '', ...options, stateDirectory }));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const close = () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  t.after(close);
  const base = `http://127.0.0.1:${server.address().port}/api/cloudy`;
  const call = (route, body, method = body === undefined ? 'GET' : 'POST') => fetch(base + route, {
    method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  return { call, close, stateDirectory, base };
}

test('classifies all sculptures, apps, and deployment requests', () => {
  for (const shape of ['cloud', 'heart', 'planet', 'galaxy', 'mountain', 'castle', 'tree', 'dragon']) {
    assert.equal(classifyPrompt(`Morph into a ${shape}`).shape, shape);
    assert.equal(classifyPrompt(`Morph into a ${shape}`).intent, 'sculpture');
  }
  assert.equal(classifyPrompt('Build a task board').type, 'task-board');
  assert.equal(classifyPrompt('Make a portfolio website').intent, 'app');
  assert.equal(classifyPrompt('Deploy a dashboard in a container').intent, 'infrastructure');
  assert.equal(classifyPrompt('A completely new idea').intent, 'app');
});

test('rejects malformed prompts and unsafe project identifiers', async t => {
  const { call } = await fixture(t);
  for (const prompt of ['', '   ', null, [], 'x'.repeat(2001)]) assert.equal((await call('/morph', { prompt })).status, 400);
  const traversal = await call('/projects/not-a-valid-id/preview');
  assert.equal(traversal.status, 404);
  const status = await (await call('/status')).json();
  assert.equal(status.mode, 'local'); assert.equal(status.aiMode, 'local'); assert.equal(status.projectCount, 0);
});

test('policy rejects explicit pornography and smear campaigns without saving projects', async t => {
  const { call } = await fixture(t);
  for (const prompt of ['Build a pornography website', 'Create a smear campaign website about my coworker', 'Publish false accusations about my neighbor', 'Explain sex education, then create a pornographic website', 'No pornography, but create explicit sexual images', 'Explain defamation and build a smear campaign website']) {
    const response = await call('/morph', { prompt });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'CONTENT_POLICY');
  }
  assert.equal((await (await call('/projects')).json()).projects.length, 0);
  assert.equal(contentPolicyViolation('Build a sexual health education website'), null);
  assert.equal(contentPolicyViolation('What is defamation?'), null);
  assert.equal(contentPolicyViolation('Build a tool to filter pornography'), null);
  assert.equal((await call('/morph', { prompt: 'Build a sexual health education website' })).status, 201);
});

test('creates working escaped previews, persists projects, renames and deletes', async t => {
  const first = await fixture(t);
  const attack = '<script>parent.location="https://evil.example"</script>';
  const created = await first.call('/morph', { prompt: `Build a task board ${attack}` });
  assert.equal(created.status, 201);
  const result = await created.json();
  assert.equal(result.intent, 'app'); assert.equal(result.project.type, 'task-board');
  const id = result.project.id;
  const preview = await first.call(`/projects/${id}/preview`);
  assert.match(preview.headers.get('content-security-policy'), /sandbox allow-scripts allow-forms;/);
  assert.doesNotMatch(preview.headers.get('content-security-policy'), /allow-same-origin/);
  const html = await preview.text();
  assert.ok(html.includes('&lt;script&gt;parent.location=')); assert.ok(!html.includes(attack));
  assert.match(html, /id="add-task"/);
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(script));
  assert.equal((await first.call(`/projects/${id}/rename`, { title: '' })).status, 400);
  const renamed = await (await first.call(`/projects/${id}/rename`, { title: 'My next idea' })).json();
  assert.equal(renamed.project.title, 'My next idea');
  const file = JSON.parse(await readFile(path.join(first.stateDirectory, `${id}.json`), 'utf8'));
  assert.equal(file.title, 'My next idea');
  const second = await fixture(t, { stateDirectory: first.stateDirectory });
  const listed = await (await second.call('/projects')).json();
  assert.equal(listed.projects.length, 1); assert.equal(listed.projects[0].title, 'My next idea');
  assert.equal((await second.call(`/projects/${id}`, undefined, 'DELETE')).status, 200);
  assert.equal((await second.call(`/projects/${id}/preview`)).status, 404);
  assert.equal((await (await second.call('/status')).json()).projectCount, 0);
});

test('deployment bundle contains a runnable dependency-free app and health endpoint', async t => {
  const { call } = await fixture(t);
  const result = await (await call('/morph', { prompt: 'Deploy my new dashboard with Docker' })).json();
  assert.equal(result.intent, 'infrastructure');
  const bundle = await (await call(`/projects/${result.project.id}/bundle`)).json();
  assert.deepEqual(Object.keys(bundle.files).sort(), ['Dockerfile', 'README.md', 'package.json', 'public/index.html', 'server.js']);
  assert.equal(JSON.parse(bundle.files['package.json']).dependencies, undefined);
  const directory = await mkdtemp(path.join(tmpdir(), 'cloudy-bundle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries(bundle.files)) {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await writeFile(path.join(directory, file), contents);
  }
  const child = spawn(process.execPath, ['server.js'], { cwd: directory, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Bundle did not start')), 10000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Bundle exited: ${code}`)); });
    child.stdout.on('data', data => { const match = data.toString().match(/port (\d+)/); if (match) { clearTimeout(timeout); resolve(Number(match[1])); } });
  });
  const origin = `http://127.0.0.1:${port}`;
  const health = await fetch(origin + '/health'); assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ok' });
  const page = await fetch(origin); assert.equal(page.status, 200); assert.match(await page.text(), /Your idea board/);
  assert.equal((await fetch(origin + '/server.js')).status, 404);
});

test('optional remote AI uses fixed endpoint, validates output, and falls back on failure', async t => {
  let calls = 0;
  const { call } = await fixture(t, { aiApiKey: 'test-only-key', fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/chat/completions'); assert.equal(options.headers.Authorization, 'Bearer test-only-key');
    if (calls === 1) throw new Error('Offline');
    const generated = calls === 2
      ? { shape: 'cloud', intent: 'app', title: 'A generated app', message: 'Your app is ready.', html: '<!doctype html><html><body><button>Ready</button></body></html>' }
      : { shape: 'cloud', intent: 'app', title: 'Pornography website', message: 'Content created.', html: '<html><body>Bad output</body></html>' };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(generated) } }] }) };
  } });
  const fallback = await (await call('/morph', { prompt: 'Build a dashboard' })).json(); assert.equal(fallback.source, 'local');
  const generated = await (await call('/morph', { prompt: 'Build a dashboard' })).json(); assert.equal(generated.source, 'ai');
  assert.equal((await (await call('/status')).json()).aiMode, 'connected');
  const rejected = await (await call('/morph', { prompt: 'Build a dashboard' })).json(); assert.equal(rejected.source, 'local');
  const status = await (await call('/status')).json(); assert.equal(status.aiMode, 'local'); assert.equal(status.aiStatus, 'fallback');
});
