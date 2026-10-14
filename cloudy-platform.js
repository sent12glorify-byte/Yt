import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SHAPES = ['cloud', 'heart', 'earth', 'planet', 'galaxy', 'mountain', 'castle', 'tree', 'dragon'];
const INTENTS = ['sculpture', 'app', 'infrastructure'];
const PROJECT_ID = /^cld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_PROMPT = 2000;
const MAX_HTML = 120000;
const PREVIEW_POLICY = "sandbox allow-scripts allow-forms; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; connect-src https://api.open-meteo.com; base-uri 'none'; form-action 'none'";

export function contentPolicyViolation(text) {
  // An educational or prevention clause cannot exempt a separate creation request.
  const clauses = String(text).toLowerCase().split(/[.;,!?\n]+|\b(?:and|but|then|however|also)\b/);
  for (const value of clauses) {
    const educational = /\b(what is|what are|explain|define|history of|education about|sexual health|sex education)\b/.test(value);
    const prevention = /\b(block|filter|detect|prevent|report|moderate|ban|no)\b.{0,50}\b(porn(?:ography|ographic)?|defamation|slander|harassment)\b/.test(value);
    const creation = /\b(create|make|build|generate|produce|draw|render|show|publish|provide)\b/.test(value);
    const explicitArtifact = /\b(porn(?:ography|ographic)?)\s+(website|site|app|images?|videos?|stories|content)\b/.test(value)
      || /\b(explicit|graphic)\s+(sex|sexual content|sexual images|sexual videos)\b/.test(value);
    const pornography = /\b(porn(?:ography|ographic)?|hardcore sex|sex tape)\b/.test(value) || explicitArtifact;
    if (pornography && !prevention && (!educational || (creation && explicitArtifact))) {
      return 'Cloudy does not create pornography. Try a different idea.';
    }
    const harmfulCampaign = /\b(smear|slander|defamation|harassment|humiliation)\s+(campaign|site|website|platform)\b/.test(value)
      || /\b(spread|invent|fabricate|make up|publish)\b.{0,90}\b(lies about|false allegations|false accusations|malicious rumors)\b/.test(value)
      || /\b(ruin|destroy)\b.{0,40}\b(reputation)\b/.test(value);
    if (harmfulCampaign && !prevention && (!educational || creation)) return 'Cloudy does not create smear campaigns, invented accusations, or targeted harassment. Try a constructive idea.';
  }
  return null;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function classifyPrompt(prompt) {
  const lower = prompt.toLowerCase();
  const aliases = [
    ['heart', /\b(heart|love)\b/], ['earth', /\b(earth|terra|homeworld|globe(?:\s*earth)?)\b/], ['planet', /\b(planet|saturn|orbit)\b/],
    ['galaxy', /\b(galaxy|space|universe|stars?|cosmos)\b/], ['mountain', /\b(mountain|mountains|peak|alpine)\b/],
    ['castle', /\b(castle|palace|fortress)\b/], ['tree', /\b(tree|forest|garden)\b/],
    ['dragon', /\b(dragon|dragonfly)\b/], ['cloud', /\b(cloud|cloudy)\b/],
  ];
  const match = aliases.find(([, expression]) => expression.test(lower));
  const shape = match?.[0] || 'cloud';
  const infrastructure = /\b(deploy(?:ment)?|hosting?|scale|scaling|server|container|infrastructure|docker|kubernetes)\b/.test(lower);
  const app = /\b(app|application|website|site|dashboard|workspace|platform|task|tasks|todo|to-do|kanban|portfolio|store|shop|weather|landing|page|notes?|timer|business|restaurant)\b/.test(lower);
  const intent = infrastructure ? 'infrastructure' : app || !match ? 'app' : 'sculpture';
  const type = /\b(weather|forecast)\b/.test(lower) ? 'weather'
    : /\b(store|shop|ecommerce|commerce)\b/.test(lower) ? 'store'
      : /\b(task|tasks|todo|to-do|kanban|board)\b/.test(lower) ? 'task-board'
        : /\b(dashboard|analytics|workspace|platform)\b/.test(lower) || infrastructure ? 'dashboard' : 'landing-page';
  const defaultTitles = { weather: 'Weather window', store: 'Cloudy shop', 'task-board': 'Room to make things', dashboard: 'Your cloud workspace', 'landing-page': 'A little above ordinary' };
  const quoted = prompt.match(/["“]([^"”\n]{2,80})["”]/)?.[1];
  const title = quoted || (intent === 'sculpture' ? `${shape[0].toUpperCase()}${shape.slice(1)} in the clouds` : defaultTitles[type]);
  return { shape, intent, type, title };
}

const APP_STYLES = `
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#182339;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}button,input,textarea{font:inherit}button,a,input{outline-offset:4px}button{cursor:pointer}a{color:inherit}button,.button{border:0;border-radius:12px;background:#4976ee;color:white;padding:12px 19px;font-weight:650;text-decoration:none;display:inline-block}button:hover,.button:hover{background:#365fd1}.secondary{background:white;color:#344259;border:1px solid #dbe2ed}.secondary:hover{background:#edf2fb}input,textarea{border:1px solid #dbe2ed;border-radius:10px;background:white;padding:12px;color:#182339;min-width:0}header{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:38px}.brand{font-size:17px;letter-spacing:-.5px;font-weight:750}.brand span{color:#6485d5}nav{display:flex;gap:22px;font-size:13px;color:#617089}main{max-width:1120px;margin:auto;padding:32px 36px 60px}.eyebrow{text-transform:uppercase;letter-spacing:2px;font-size:11px;font-weight:750;color:#7790b9}h1{font-size:clamp(30px,5vw,54px);line-height:1.1;letter-spacing:-2px;margin:13px 0 18px}h2{font-size:19px;letter-spacing:-.5px}.muted{color:#788599;font-size:14px;line-height:1.6}.intro{max-width:650px;margin-bottom:30px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.card{background:white;border:1px solid #e3e8f2;border-radius:18px;padding:22px;box-shadow:0 5px 25px #243d6610}.row{display:flex;gap:10px;align-items:center}.stack{display:grid;gap:14px}.empty{border:1px dashed #dce3ef;border-radius:12px;padding:23px;text-align:center;color:#8a96a8;font-size:13px}.badge{font-size:11px;background:#e9efff;color:#597aca;border-radius:8px;padding:6px 9px}.wide{width:100%}.notice{padding:14px 17px;border-radius:12px;background:#eaf0fc;color:#5572a8;font-size:13px;line-height:1.6}footer{margin-top:42px;font-size:12px;color:#95a1b3}.metric{font-size:38px;font-weight:700;letter-spacing:-1px;margin:13px 0}.hero{background:linear-gradient(125deg,#e9f1ff,#f6eefd);border:1px solid #e2e7f4;border-radius:24px;padding:50px 42px;margin-bottom:24px;position:relative;overflow:hidden}.hero p{max-width:590px;line-height:1.8;color:#67748d}.feature-icon{font-size:26px;margin-bottom:20px}.task{background:#fff;border:1px solid #e2e8f1;border-radius:12px;padding:15px;margin-top:10px}.task .row{justify-content:space-between;margin-top:16px}.task button{font-size:11px;padding:7px 9px}.task select{max-width:110px;border:1px solid #e3e8f2;border-radius:8px;padding:6px;background:#f6f8fd;color:#5a6c85}.task strong{font-size:14px;font-weight:600;overflow-wrap:anywhere}.task-column{background:#eef2f8;border-radius:16px;padding:16px;min-height:250px}.task-column h2{font-size:13px;color:#6d7a91;margin:0 0 16px}.form-row{display:flex;gap:10px;margin:25px 0}.form-row input{flex:1}.product-art{background:linear-gradient(135deg,#e7eefc,#e9e6f6);height:135px;border-radius:12px;display:grid;place-items:center;font-size:52px;margin-bottom:18px}.toast{min-height:24px;color:#6481bb;font-size:13px}.forecast{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:20px}.forecast .card{padding:16px;font-size:13px}.forecast strong{display:block;font-size:27px;margin:16px 0}.contact{display:none;margin-top:18px}.contact.open{display:block}@media(max-width:700px){main{padding:24px 20px}nav{display:none}.grid,.forecast{grid-template-columns:1fr}.hero{padding:32px 24px}.form-row{flex-wrap:wrap}.form-row input{flex-basis:100%}.task-column{min-height:130px}}
`;

function documentShell(title, body, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${APP_STYLES}</style></head><body><main><header><div class="brand">☁ <span>cloudy</span> / ${escapeHtml(title)}</div><nav><a href="#workspace">Workspace</a><a href="#about">About</a></nav></header>${body}<footer id="about">Made with Cloudy · A working starting point, ready to make your own.</footer></main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

function taskBoard(title, prompt) {
  return documentShell(title, `<section class="intro" id="workspace"><span class="eyebrow">A little more organized</span><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(prompt)}</p></section><form id="add-task" class="form-row"><input id="task-input" aria-label="New task" placeholder="What would you like to make happen?" maxlength="180" required><button>Add task +</button></form><div class="grid" id="board"></div><p class="muted" id="summary" aria-live="polite"></p>`, `
const storageKey='cloudy-tasks-'+${scriptJson(title)};
let tasks=[];try{tasks=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(tasks))tasks=[];tasks=tasks.filter(t=>t&&typeof t.text==='string'&&['To do','In progress','Done'].includes(t.status));}catch{}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(tasks));}catch{}render();}
function render(){const board=document.getElementById('board');board.replaceChildren();['To do','In progress','Done'].forEach(status=>{const column=document.createElement('section');column.className='task-column';const heading=document.createElement('h2');heading.textContent=status+' · '+tasks.filter(t=>t.status===status).length;column.append(heading);const group=tasks.filter(t=>t.status===status);if(!group.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Room for your next idea';column.append(empty);}group.forEach(task=>{const card=document.createElement('article');card.className='task';const name=document.createElement('strong');name.textContent=task.text;const row=document.createElement('div');row.className='row';const select=document.createElement('select');select.setAttribute('aria-label','Move '+task.text);['To do','In progress','Done'].forEach(state=>{const option=document.createElement('option');option.value=state;option.textContent=state;option.selected=state===status;select.append(option);});select.onchange=()=>{task.status=select.value;save();};const remove=document.createElement('button');remove.className='secondary';remove.textContent='Remove';remove.onclick=()=>{tasks=tasks.filter(t=>t!==task);save();};row.append(select,remove);card.append(name,row);column.append(card);});board.append(column);});document.getElementById('summary').textContent=tasks.length?tasks.filter(t=>t.status==='Done').length+' of '+tasks.length+' tasks complete':'Add your first task to get started. Preview tasks stay in this session; the exported app saves them in your browser.';}
document.getElementById('add-task').onsubmit=e=>{e.preventDefault();const input=document.getElementById('task-input');const text=input.value.trim();if(text){tasks.push({text,status:'To do'});input.value='';save();}};render();`);
}

function dashboard(title, prompt) {
  return documentShell(title, `<section class="intro" id="workspace"><span class="eyebrow">Everything has room to grow</span><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(prompt)}</p></section><div class="grid"><section class="card"><span class="muted">Your notes</span><div class="metric" id="note-count">0</div><span class="badge">Created in this workspace</span></section><section class="card"><span class="muted">Focus minutes</span><div class="metric" id="focus-minutes">0</div><span class="badge">Completed focus sessions</span></section><section class="card"><span class="muted">Session focus</span><div class="metric" id="timer">25:00</div><div class="row"><button id="timer-toggle">Start focus</button><button id="timer-reset" class="secondary">Reset</button></div></section></div><section class="card" style="margin-top:24px"><h2>Your idea board</h2><form class="form-row" id="add-note"><input id="note-input" aria-label="New note" maxlength="300" placeholder="Capture an idea, a reminder, a next step…" required><button>Save note +</button></form><div id="notes" class="stack"></div></section><p class="notice" style="margin-top:20px">These numbers come from your activity in this workspace. Connect real data sources as you develop your app.</p>`, `
const storageKey='cloudy-workspace-'+${scriptJson(title)};let state={notes:[],minutes:0};try{const stored=JSON.parse(localStorage.getItem(storageKey)||'null');if(stored&&Array.isArray(stored.notes)&&Number.isFinite(stored.minutes)){state={notes:stored.notes.filter(n=>typeof n==='string'),minutes:Math.max(0,stored.minutes)};}}catch{}
function save(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}render();}
function render(){document.getElementById('note-count').textContent=state.notes.length;document.getElementById('focus-minutes').textContent=state.minutes;const notes=document.getElementById('notes');notes.replaceChildren();if(!state.notes.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='A blank canvas for what comes next';notes.append(empty);}state.notes.forEach((text,index)=>{const row=document.createElement('div');row.className='row';row.style.justifyContent='space-between';const content=document.createElement('span');content.textContent=text;const button=document.createElement('button');button.className='secondary';button.textContent='Remove';button.onclick=()=>{state.notes.splice(index,1);save();};row.append(content,button);notes.append(row);});}
document.getElementById('add-note').onsubmit=e=>{e.preventDefault();const input=document.getElementById('note-input');if(input.value.trim()){state.notes.unshift(input.value.trim());input.value='';save();}};
let remaining=1500, interval;const toggle=document.getElementById('timer-toggle');function paintTimer(){document.getElementById('timer').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');}toggle.onclick=()=>{if(interval){clearInterval(interval);interval=undefined;toggle.textContent='Continue';}else{toggle.textContent='Pause';interval=setInterval(()=>{remaining--;paintTimer();if(remaining<=0){clearInterval(interval);interval=undefined;state.minutes+=25;save();remaining=1500;toggle.textContent='Start focus';paintTimer();}},1000);}};document.getElementById('timer-reset').onclick=()=>{clearInterval(interval);interval=undefined;remaining=1500;toggle.textContent='Start focus';paintTimer();};render();`);
}

function landingPage(title, prompt) {
  return documentShell(title, `<section class="hero" id="workspace"><span class="eyebrow">An idea, taking shape</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(prompt)}</p><div class="row"><button id="contact-toggle">Let's make something →</button><a class="button secondary" href="#explore">Explore the possibilities</a></div><div class="contact" id="contact-panel"><form id="contact-form" class="stack"><label>Your name <input id="contact-name" class="wide" required maxlength="100" autocomplete="name"></label><label>Your idea <textarea id="contact-idea" class="wide" required maxlength="1000" rows="3"></textarea></label><button>Copy inquiry</button><p class="toast" id="contact-result" aria-live="polite"></p></form></div></section><section class="grid" id="explore"><article class="card"><div class="feature-icon">✧</div><h2>Make an impression</h2><p class="muted">A thoughtful first moment for your next project. Introduce your work and share what makes it yours.</p></article><article class="card"><div class="feature-icon">↗</div><h2>Grow at your pace</h2><p class="muted">Start with something small. This page is yours to customize as your ideas find their feet.</p></article><article class="card"><div class="feature-icon">☁</div><h2>Ready for the web</h2><p class="muted">Download this self-contained app and run it on any platform that hosts a Node.js application.</p></article></section>`, `
document.getElementById('contact-toggle').onclick=()=>{document.getElementById('contact-panel').classList.toggle('open');};document.getElementById('contact-form').onsubmit=async e=>{e.preventDefault();const name=document.getElementById('contact-name').value;const idea=document.getElementById('contact-idea').value;const text='Inquiry from '+name+'\\n\\n'+idea;const result=document.getElementById('contact-result');try{await navigator.clipboard.writeText(text);result.textContent='Inquiry copied. Share it through your preferred channel.';}catch{result.textContent=text+' — Copy this text to share your inquiry.';}};`);
}

function store(title, prompt) {
  return documentShell(title, `<section class="intro" id="workspace"><span class="eyebrow">The little things, thoughtfully made</span><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(prompt)}</p></section><p class="notice">Sample products for your storefront. This preview does not process payments.</p><div class="grid" id="products" style="margin-top:24px"></div><section class="card" style="margin-top:24px"><div class="row" style="justify-content:space-between"><h2>Your bag <span class="badge" id="cart-count">0 items</span></h2><button id="cart-clear" class="secondary">Empty bag</button></div><div class="stack" id="cart-items"></div><div class="row" style="justify-content:space-between;margin-top:25px"><strong id="cart-total">Total $0.00</strong><button id="checkout">Review bag →</button></div><p class="toast" id="cart-message" aria-live="polite"></p></section>`, `
const products=[{name:'Everyday notebook',price:18,icon:'📓'},{name:'Morning mug',price:24,icon:'☕'},{name:'Canvas carryall',price:32,icon:'👜'}];const cart=[];const productGrid=document.getElementById('products');products.forEach((product,index)=>{const card=document.createElement('article');card.className='card';const art=document.createElement('div');art.className='product-art';art.textContent=product.icon;const name=document.createElement('h2');name.textContent=product.name;const price=document.createElement('p');price.className='muted';price.textContent='$'+product.price.toFixed(2);const button=document.createElement('button');button.textContent='Add to bag +';button.onclick=()=>{cart.push(index);renderCart();};card.append(art,name,price,button);productGrid.append(card);});function renderCart(){const items=document.getElementById('cart-items');items.replaceChildren();products.forEach((product,index)=>{const count=cart.filter(id=>id===index).length;if(!count)return;const row=document.createElement('div');row.className='row';row.style.justifyContent='space-between';const label=document.createElement('span');label.textContent=product.name+' × '+count;const button=document.createElement('button');button.className='secondary';button.textContent='Remove one';button.onclick=()=>{cart.splice(cart.indexOf(index),1);renderCart();};row.append(label,button);items.append(row);});if(!cart.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Your next favorite thing belongs here.';items.append(empty);}document.getElementById('cart-count').textContent=cart.length+' items';document.getElementById('cart-total').textContent='Total $'+cart.reduce((sum,id)=>sum+products[id].price,0).toFixed(2);document.getElementById('cart-message').textContent='';}document.getElementById('cart-clear').onclick=()=>{cart.length=0;renderCart();};document.getElementById('checkout').onclick=()=>{document.getElementById('cart-message').textContent=cart.length?'Your bag is ready. Connect a payment provider before accepting orders.':'Add something to your bag first.';};renderCart();`);
}

function weather(title, prompt) {
  return documentShell(title, `<section class="intro" id="workspace"><span class="eyebrow">A window to the world</span><h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(prompt)}</p></section><section class="card"><h2>Find your forecast</h2><p class="muted">Enter coordinates for a five-day forecast from Open-Meteo. Requires an internet connection.</p><form class="form-row" id="weather-form"><input id="latitude" type="number" step="any" min="-90" max="90" placeholder="Latitude, e.g. 40.71" aria-label="Latitude" required><input id="longitude" type="number" step="any" min="-180" max="180" placeholder="Longitude, e.g. -74.01" aria-label="Longitude" required><button id="weather-load">Show forecast</button></form><p id="weather-status" class="muted" aria-live="polite">Choose a place to see real weather data.</p><div id="forecast" class="forecast"></div></section><p class="muted">Weather data: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>. Forecasts are estimates and may change.</p>`, `
document.getElementById('weather-form').onsubmit=async event=>{event.preventDefault();const status=document.getElementById('weather-status');const forecast=document.getElementById('forecast');const button=document.getElementById('weather-load');forecast.replaceChildren();button.disabled=true;status.textContent='Looking up the forecast…';const lat=Number(document.getElementById('latitude').value),lon=Number(document.getElementById('longitude').value);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){status.textContent='Enter valid latitude and longitude coordinates.';button.disabled=false;return;}try{const response=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+'&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=5&timezone=auto',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('Forecast unavailable');const data=await response.json();if(!data.daily||!Array.isArray(data.daily.time))throw new Error('Forecast unavailable');data.daily.time.forEach((day,index)=>{const card=document.createElement('article');card.className='card';const date=document.createElement('span');date.textContent=day;const temperature=document.createElement('strong');temperature.textContent=data.daily.temperature_2m_max[index]+'°C';const low=document.createElement('div');low.className='muted';low.textContent='Low '+data.daily.temperature_2m_min[index]+'°C';const rain=document.createElement('p');rain.className='muted';rain.textContent='Rain chance '+data.daily.precipitation_probability_max[index]+'%';card.append(date,temperature,low,rain);forecast.append(card);});status.textContent='Forecast for '+lat.toFixed(2)+', '+lon.toFixed(2)+' · '+data.timezone;}catch{status.textContent='The forecast could not be loaded. Check your connection and try again.';}finally{button.disabled=false;}};`);
}

export function generateLocalApp({ title, prompt, type }) {
  const templates = { 'task-board': taskBoard, dashboard, 'landing-page': landingPage, store, weather };
  return (templates[type] || landingPage)(title, prompt);
}

export function createDeploymentBundle(project) {
  const packageName = `cloudy-${project.id.slice(-12)}`;
  const server = `import http from 'node:http';\nimport { readFile } from 'node:fs/promises';\nconst html = await readFile(new URL('./public/index.html', import.meta.url));\nconst port = Number(process.env.PORT || 8080);\nconst server = http.createServer((request, response) => {\n  const pathname = new URL(request.url, 'http://localhost').pathname;\n  response.setHeader('X-Content-Type-Options', 'nosniff');\n  if (pathname === '/health') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ status: 'ok' })); return; }\n  if (pathname !== '/' && pathname !== '/index.html') { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('Not found'); return; }\n  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }\n  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; connect-src https://api.open-meteo.com; base-uri 'none'; form-action 'none'" });\n  response.end(request.method === 'HEAD' ? undefined : html);\n});\nserver.listen(port, '0.0.0.0', () => console.log('Cloudy app listening on port ' + server.address().port));\n`;
  return {
    project: publicProject(project),
    files: {
      Dockerfile: 'FROM node:22-alpine\nWORKDIR /app\nCOPY package.json server.js ./\nCOPY public ./public\nENV PORT=8080\nEXPOSE 8080\nUSER node\nCMD ["node", "server.js"]\n',
      'package.json': JSON.stringify({ name: packageName, version: '1.0.0', private: true, type: 'module', scripts: { start: 'node server.js' }, engines: { node: '>=22' } }, null, 2) + '\n',
      'server.js': server,
      'public/index.html': project.html,
      'README.md': `# ${project.title}\n\nGenerated by Cloudy. This is a self-contained Node.js app with no package dependencies.\n\n## Run locally\n\nUse Node.js 22 or newer. Run:\n\n\`\`\`sh\nnode server.js\n\`\`\`\n\nOpen http://localhost:8080. The server accepts a PORT environment variable and binds to 0.0.0.0. Health checks are available at /health.\n\n## Run in Docker\n\n\`\`\`sh\ndocker build -t ${packageName} .\ndocker run --rm -p 8080:8080 ${packageName}\n\`\`\`\n\n## Deploy\n\nUpload these files to a Node.js or Docker hosting service. Select Node.js 22+, start with \`node server.js\`, and set the health check path to \`/health\`. The service can inject its own PORT. No external deployment has been performed by Cloudy.\n\n## Data and customization\n\nEdit public/index.html to change your app. Task boards and workspace notes use browser localStorage when available; previews keep data only for the current session. Store products are clearly labeled samples and payments are not connected. Weather apps fetch public forecasts from Open-Meteo and require internet access. The generated app has no database or authentication service.\n`,
    },
  };
}

function publicProject(project, baseUrl = '/api/cloudy') {
  const { id, title, type, shape, prompt, createdAt, updatedAt, source } = project;
  return { id, title, type, shape, prompt, createdAt, updatedAt, source, previewUrl: `${baseUrl}/projects/${id}/preview`, bundleUrl: `${baseUrl}/projects/${id}/bundle` };
}

function validateRemote(value) {
  if (!value || !SHAPES.includes(value.shape) || !INTENTS.includes(value.intent)) return null;
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100) return null;
  if (typeof value.message !== 'string' || !value.message.trim() || value.message.length > 600) return null;
  if (value.intent !== 'sculpture' && (typeof value.html !== 'string' || value.html.length > MAX_HTML || !/<html[\s>]/i.test(value.html) || !/<\/html>/i.test(value.html))) return null;
  return { shape: value.shape, intent: value.intent, title: value.title.trim(), message: value.message.trim(), html: value.intent === 'sculpture' ? undefined : value.html };
}

export function createCloudyRouter({ stateDirectory = process.env.CLOUDY_STATE_DIR || '/workspace/.cloudy-state', aiApiKey = process.env.CLOUDY_AI_API_KEY, aiModel = process.env.CLOUDY_AI_MODEL || 'gpt-4o-mini', fetchImpl = globalThis.fetch } = {}) {
  const router = express.Router();
  const projects = new Map();
  const started = Date.now();
  let aiMode = 'local';
  let aiStatus = aiApiKey ? 'available' : 'local';
  let queue = Promise.resolve();
  const ready = (async () => {
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
    const files = await readdir(stateDirectory);
    for (const file of files.filter((name) => name.endsWith('.json') && PROJECT_ID.test(name.slice(0, -5)))) {
      try {
        const project = JSON.parse(await readFile(path.join(stateDirectory, file), 'utf8'));
        if (project.id === file.slice(0, -5) && typeof project.title === 'string' && typeof project.html === 'string' && project.html.length <= MAX_HTML) projects.set(project.id, project);
      } catch { /* A damaged project does not prevent other projects loading. */ }
    }
  })();
  // Express may not receive a request until initialization completes. Keep a handled
  // promise so a filesystem failure becomes a useful API error, not an unhandled rejection.
  ready.catch(() => {});
  const serialized = (operation) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const saveProject = async (project) => {
    const target = path.join(stateDirectory, `${project.id}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(project), { mode: 0o600 }); await rename(temporary, target); }
    catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  };
  const route = (handler) => async (req, res, next) => {
    try { await ready; await handler(req, res); } catch (error) { next(error); }
  };
  router.use(express.json({ limit: '16kb' }));

  router.get('/status', route(async (req, res) => {
    res.json({ mode: 'local', aiMode, aiConfigured: Boolean(aiApiKey), aiStatus, projectCount: projects.size, uptime: Math.floor((Date.now() - started) / 1000), capabilities: ['morphing-cloud', 'app-previews', 'project-workspace', 'deployment-bundles'] });
  }));

  router.post('/morph', route(async (req, res) => {
    const prompt = req.body?.prompt;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT) {
      res.status(400).json({ error: 'Enter a prompt between 1 and 2,000 characters.' }); return;
    }
    const cleanPrompt = prompt.trim();
    const violation = contentPolicyViolation(cleanPrompt);
    if (violation) { res.status(422).json({ error: violation, code: 'CONTENT_POLICY' }); return; }
    const local = classifyPrompt(cleanPrompt);
    let result = { ...local, message: local.intent === 'sculpture' ? `Cloudy is taking the shape of a ${local.shape}.` : local.intent === 'infrastructure' ? 'Your app and a runnable Node.js / Docker deployment bundle are ready. Download the bundle to deploy to your hosting provider.' : 'Your working app is ready. Open its preview, try it out, and make it your own.' };
    let source = 'local';
    if (aiApiKey && fetchImpl) {
      try {
        const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST', signal: AbortSignal.timeout(14000),
          headers: { Authorization: `Bearer ${aiApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: aiModel, response_format: { type: 'json_object' }, temperature: 0.7, max_tokens: 9000, messages: [
            { role: 'system', content: 'You are Cloudy, a creative app builder. Never generate pornography, invented harmful accusations, smear campaigns, or targeted harassment. Educational sexual health and neutral discussion of defamation are allowed. Return only a JSON object with shape, intent, title, message, html. shape must be one of cloud, heart, earth, planet, galaxy, mountain, castle, tree, dragon. Earth, Terra, homeworld, and Earth globes use the distinct earth shape; Saturn and generic planets use planet. intent must be sculpture, app, or infrastructure. For visual shape requests use sculpture and empty html. For apps or infrastructure create a useful complete interactive self-contained HTML document with inline CSS/JS, no external scripts, no external fonts, no tracking, and no secrets. Keep HTML below 120000 characters, title under 100 and message under 600. Do not claim deployment or real data integrations. Clearly label sample data. Use DOM textContent for user input. App requests must produce an app; infrastructure requests produce an app ready for a Node/Docker bundle. Keep all network requests absent except weather forecasts may use https://api.open-meteo.com.' },
            { role: 'user', content: cleanPrompt },
          ] }),
        });
        if (!response.ok) throw new Error('AI request failed');
        const payload = await response.json();
        const raw = payload.choices?.[0]?.message?.content;
        if (typeof raw !== 'string' || raw.length > MAX_HTML + 2000) throw new Error('Invalid AI response');
        const generated = validateRemote(JSON.parse(raw));
        if (!generated || (local.intent !== 'sculpture' && generated.intent === 'sculpture')) throw new Error('Invalid AI output');
        if (contentPolicyViolation(`${generated.title}\n${generated.message}\n${generated.html || ''}`)) throw new Error('Generated output violates content policy');
        result = { ...local, ...generated };
        source = 'ai'; aiMode = 'connected'; aiStatus = 'connected';
      } catch { aiMode = 'local'; aiStatus = 'fallback'; }
    }
    const { shape, intent, title, message } = result;
    if (intent === 'sculpture') { res.json({ shape, intent, title, message, source }); return; }
    const now = new Date().toISOString();
    const project = { id: `cld_${randomUUID()}`, title, prompt: cleanPrompt, type: local.type, shape, source, html: result.html || generateLocalApp({ title, prompt: cleanPrompt, type: local.type }), createdAt: now, updatedAt: now };
    await serialized(async () => { await saveProject(project); projects.set(project.id, project); });
    res.status(201).json({ shape, intent, title, message, source, project: publicProject(project, req.baseUrl) });
  }));

  router.get('/projects', route(async (req, res) => {
    res.json({ projects: [...projects.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((project) => publicProject(project, req.baseUrl)) });
  }));

  const getProject = (req, res) => {
    const project = PROJECT_ID.test(req.params.id) ? projects.get(req.params.id) : undefined;
    if (!project) res.status(404).json({ error: 'Project not found.' });
    return project;
  };

  router.get('/projects/:id/preview', route(async (req, res) => {
    const project = getProject(req, res); if (!project) return;
    res.set({ 'Content-Security-Policy': PREVIEW_POLICY, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }).type('html').send(project.html);
  }));

  router.get('/projects/:id/bundle', route(async (req, res) => {
    const project = getProject(req, res); if (!project) return;
    const bundle = createDeploymentBundle(project);
    bundle.project = publicProject(project, req.baseUrl);
    res.set({ 'Content-Disposition': `attachment; filename="cloudy-${project.id}.json"`, 'Cache-Control': 'no-store' }).json(bundle);
  }));

  router.post('/projects/:id/rename', route(async (req, res) => {
    const project = getProject(req, res); if (!project) return;
    const title = req.body?.title;
    if (typeof title !== 'string' || !title.trim() || title.length > 100) { res.status(400).json({ error: 'Enter a project title between 1 and 100 characters.' }); return; }
    await serialized(async () => {
      if (!projects.has(project.id)) { res.status(404).json({ error: 'Project not found.' }); return; }
      const updated = { ...projects.get(project.id), title: title.trim(), updatedAt: new Date().toISOString() };
      await saveProject(updated); projects.set(project.id, updated); res.json({ project: publicProject(updated, req.baseUrl) });
    });
  }));

  router.delete('/projects/:id', route(async (req, res) => {
    const project = getProject(req, res); if (!project) return;
    await serialized(async () => {
      if (!projects.has(project.id)) { res.status(404).json({ error: 'Project not found.' }); return; }
      await unlink(path.join(stateDirectory, `${project.id}.json`)); projects.delete(project.id); res.json({ deleted: project.id });
    });
  }));

  router.use((error, req, res, next) => {
    if (res.headersSent) { next(error); return; }
    if (error.type === 'entity.too.large') { res.status(413).json({ error: 'Request is too large.' }); return; }
    if (error instanceof SyntaxError && error.status === 400) { res.status(400).json({ error: 'Send a valid JSON request.' }); return; }
    res.status(500).json({ error: 'Cloudy could not save or load your project. Check that the state directory is writable and try again.' });
  });
  return router;
}
