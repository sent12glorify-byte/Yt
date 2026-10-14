/**
 * Cloudy's dependency-free, transparent cloud sculpture.
 * import CloudRenderer, { supportedShapes } from './renderer.js';
 * const cloudy = new CloudRenderer(document.querySelector('canvas'));
 * cloudy.setShape('heart'); cloudy.setAtmosphere('sunset');
 */
export const supportedShapes = Object.freeze([
  'cloud', 'heart', 'planet', 'galaxy', 'mountain', 'castle', 'tree', 'dragon', 'earth', 'custom',
]);

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const palettes = {
  night: { light: [255, 251, 255], body: [226, 220, 255], shade: [131, 119, 187], edge: [110, 109, 160], glow: [171, 140, 255] },
  sunset: { light: [255, 250, 239], body: [255, 221, 223], shade: [183, 125, 170], edge: [146, 100, 156], glow: [255, 175, 157] },
  day: { light: [255, 255, 255], body: [237, 247, 255], shade: [158, 187, 219], edge: [130, 162, 201], glow: [151, 207, 255] },
};
const color = (rgb, alpha = 1) => `rgba(${rgb.map(Math.round).join(',')},${alpha})`;
const rgbMix = (a, b, t) => a.map((v, i) => mix(v, b[i], t));

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function volume(rng, cx, cy, rx, ry, depth = 0.25) {
  const a = rng() * TAU;
  const d = Math.sqrt(rng());
  return { x: cx + Math.cos(a) * d * rx, y: cy + Math.sin(a) * d * ry, z: (rng() - 0.5) * depth * 2 };
}

function along(rng, points, width = 0.06) {
  const index = Math.floor(rng() * (points.length - 1));
  const a = points[index];
  const b = points[index + 1];
  const t = rng();
  return { x: mix(a[0], b[0], t) + (rng() - 0.5) * width, y: mix(a[1], b[1], t) + (rng() - 0.5) * width, z: (rng() - 0.5) * 0.3 };
}

// Simplified geographic outlines are painted locally, then projected onto a sphere.
// This is an illustration, with no remote imagery or network dependency.
function makeEarthTexture() {
  const width = 1024;
  const height = 512;
  const texture = document.createElement('canvas');
  texture.width = width;
  texture.height = height;
  const ctx = texture.getContext('2d', { willReadFrequently: true });
  const ocean = ctx.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#164c86');
  ocean.addColorStop(0.36, '#168bbb');
  ocean.addColorStop(0.65, '#087db2');
  ocean.addColorStop(1, '#134b84');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);
  const land = document.createElement('canvas');
  land.width = width;
  land.height = height;
  const terrain = land.getContext('2d');
  const coordinates = (longitude, latitude) => [(longitude + 180) / 360 * width, (90 - latitude) / 180 * height];
  const polygon = (context, points, fill, outline = false) => {
    context.beginPath();
    points.forEach(([longitude, latitude], i) => {
      const [x, y] = coordinates(longitude, latitude);
      if (i) context.lineTo(x, y); else context.moveTo(x, y);
    });
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    if (outline) { context.strokeStyle = '#c0d59b77'; context.lineWidth = 1.4; context.stroke(); }
  };
  const continents = [
    [[-168,72],[-154,70],[-151,63],[-140,60],[-130,54],[-126,49],[-124,41],[-117,32],[-112,28],[-106,24],[-98,20],[-90,17],[-86,20],[-82,24],[-81,29],[-76,35],[-71,43],[-60,47],[-53,52],[-59,58],[-68,60],[-75,67],[-85,69],[-95,75],[-111,74],[-127,70],[-145,73]],
    [[-81,12],[-73,11],[-65,8],[-60,5],[-51,4],[-48,-2],[-35,-6],[-38,-15],[-42,-23],[-49,-29],[-53,-34],[-60,-39],[-65,-55],[-70,-53],[-75,-40],[-72,-27],[-76,-15],[-80,-4]],
    [[-17,36],[-5,36],[7,37],[12,33],[25,32],[33,29],[35,23],[43,12],[51,11],[45,1],[42,-12],[35,-22],[29,-32],[21,-35],[16,-29],[12,-18],[8,-3],[0,5],[-10,5],[-16,15],[-17,25]],
    [[-10,36],[-10,44],[-2,43],[0,49],[-5,50],[5,55],[10,57],[8,62],[13,70],[25,71],[31,66],[30,59],[43,54],[36,45],[28,41],[23,37],[15,41],[10,45],[4,43],[2,37]],
    [[25,71],[40,69],[60,70],[87,76],[106,78],[125,74],[142,69],[163,66],[178,62],[179,51],[163,58],[151,55],[142,49],[135,44],[129,38],[122,30],[121,20],[113,21],[108,12],[103,1],[99,8],[94,18],[89,22],[80,8],[73,15],[68,25],[58,25],[53,16],[44,12],[34,30],[36,42],[42,50],[30,59]],
    [[113,-22],[122,-17],[131,-12],[140,-14],[145,-20],[153,-28],[147,-38],[138,-38],[131,-32],[120,-35],[115,-29]],
    [[49,-12],[51,-17],[47,-25],[44,-24],[45,-16]],
    [[-8,50],[-6,58],[-2,59],[1,52]], [[-25,64],[-23,67],[-15,66],[-14,64]],
    [[130,31],[138,35],[143,43],[146,45],[141,42],[137,36],[132,33]],
    [[95,5],[105,-5],[102,-7],[96,0]], [[108,7],[117,6],[119,0],[114,-4],[109,0]],
    [[130,-3],[140,-3],[150,-7],[146,-10],[136,-7]], [[166,-34],[174,-39],[178,-41],[172,-43],[166,-47],[164,-44],[170,-40]],
    [[-85,23],[-74,21],[-77,19],[-85,20]], [[-74,20],[-67,19],[-68,17],[-73,18]],
  ];
  const greenery = terrain.createLinearGradient(0, 0, 0, height);
  greenery.addColorStop(0, '#a6bd94');
  greenery.addColorStop(0.35, '#72b385');
  greenery.addColorStop(0.55, '#53a578');
  greenery.addColorStop(0.75, '#80ad7a');
  greenery.addColorStop(1, '#b2c4b3');
  for (const continent of continents) polygon(terrain, continent, greenery, true);
  terrain.globalCompositeOperation = 'source-atop';
  polygon(terrain, [[-17,30],[5,34],[24,29],[34,24],[33,17],[18,14],[0,17],[-15,20]], '#d9c392');
  polygon(terrain, [[36,30],[53,27],[59,21],[52,13],[43,17]], '#cdbb8d');
  polygon(terrain, [[115,-21],[135,-18],[144,-25],[138,-32],[122,-30]], '#c7ad7a');
  polygon(terrain, [[-79,5],[-61,5],[-50,-7],[-59,-17],[-72,-13]], '#38986a');
  polygon(terrain, [[-116,45],[-108,43],[-103,25],[-111,25],[-119,38]], '#b5b98b');
  const rng = randomGenerator(3128);
  for (let i = 0; i < 1700; i++) {
    const x = rng() * width;
    const y = rng() * height;
    const radius = 2 + rng() * 11;
    const variation = terrain.createRadialGradient(x, y, 0, x, y, radius);
    variation.addColorStop(0, i % 2 ? '#e4dbb529' : '#07593724');
    variation.addColorStop(1, '#579c6500');
    terrain.fillStyle = variation;
    terrain.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.drawImage(land, 0, 0);
  polygon(ctx, [[-73,60],[-50,60],[-38,67],[-21,76],[-27,83],[-45,84],[-62,78]], '#dbe9e9');
  polygon(ctx, [[-180,-74],[-150,-71],[-124,-73],[-100,-73],[-77,-66],[-59,-71],[-40,-75],[-15,-72],[15,-71],[39,-69],[70,-71],[100,-67],[128,-68],[153,-73],[180,-74],[180,-90],[-180,-90]], '#e0ecee');
  // Wispy weather bands, intentionally softer than the land underneath them.
  ctx.lineCap = 'round';
  ctx.filter = 'blur(1.2px)';
  for (let i = 0; i < 85; i++) {
    const x = rng() * width;
    const y = 38 + rng() * (height - 76);
    const length = 12 + rng() * 72;
    const direction = rng() < 0.5 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x - length * 0.5, y);
    ctx.bezierCurveTo(x - length * 0.2, y - direction * 15, x + length * 0.1, y + direction * 12, x + length * 0.5, y - direction * 4);
    ctx.strokeStyle = `rgba(249,253,255,${0.18 + rng() * 0.34})`;
    ctx.lineWidth = 1.3 + rng() * 6;
    ctx.stroke();
  }
  ctx.filter = 'none';
  return { width, height, pixels: ctx.getImageData(0, 0, width, height).data };
}

function sampleShape(name, rng, index, count) {
  const section = index / count;
  if (name === 'cloud') {
    const lobes = [
      [-0.72, 0.12, 0.25, 0.16], [-0.48, -0.02, 0.30, 0.24],
      [-0.13, -0.14, 0.31, 0.29], [0.22, -0.07, 0.32, 0.27],
      [0.58, 0.08, 0.30, 0.18], [-0.02, 0.17, 0.67, 0.14],
    ];
    const lobe = lobes[index % lobes.length];
    return volume(rng, ...lobe, 0.34);
  }
  if (name === 'heart') {
    const t = rng() * TAU;
    const d = Math.sqrt(rng());
    return {
      x: Math.pow(Math.sin(t), 3) * 0.65 * d,
      y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 26 * d - 0.035,
      z: (rng() - 0.5) * 0.45, radius: 0.78,
    };
  }
  if (name === 'earth') {
    const point = volume(rng, 0, 0, 0.54, 0.54, 0.45);
    point.radius = 0.62;
    return point;
  }
  if (name === 'planet') {
    if (section < 0.62) return volume(rng, 0, 0, 0.47, 0.47, 0.44);
    const a = rng() * TAU;
    const r = 0.81 + (rng() - 0.5) * 0.14;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.19;
    return { x: x * 0.96 - y * 0.35, y: x * 0.27 + y * 0.96, z: Math.sin(a) * 0.6, radius: 0.5 };
  }
  if (name === 'galaxy') {
    const arm = index % 4;
    const r = Math.sqrt(rng()) * 0.91;
    const theta = arm * Math.PI / 2 + r * 4.4 + (rng() - 0.5) * 0.7;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r * 0.43;
    return { x: x * 0.96 - y * 0.3, y: y * 0.96 + x * 0.19, z: (rng() - 0.5) * 0.32, radius: r < 0.15 ? 1.1 : 0.6 };
  }
  if (name === 'mountain') {
    const x = (rng() - 0.5) * 1.75;
    const peak = x < -0.27 ? -0.39 + Math.abs(x + 0.49) * 1.4 : x > 0.35 ? -0.38 + Math.abs(x - 0.57) * 1.45 : -0.68 + Math.abs(x - 0.03) * 1.5;
    return { x, y: mix(peak, 0.39, Math.sqrt(rng())), z: (rng() - 0.5) * 0.33, radius: 0.76 };
  }
  if (name === 'castle') {
    if (section < 0.39) return volume(rng, 0, 0.24, 0.69, 0.18, 0.25);
    const tower = [-0.56, -0.26, 0.05, 0.36, 0.63][index % 5];
    const top = tower === 0.05 ? -0.58 : tower === -0.26 || tower === 0.36 ? -0.39 : -0.28;
    if (section > 0.87) {
      const y = top - rng() * 0.18;
      return { x: tower + (rng() - 0.5) * 0.26 * (1 - (top - y) / 0.21), y, z: (rng() - 0.5) * 0.2, radius: 0.55 };
    }
    return { x: tower + (rng() - 0.5) * 0.2, y: mix(top, 0.36, rng()), z: (rng() - 0.5) * 0.33, radius: 0.72 };
  }
  if (name === 'tree') {
    if (section > 0.83) return { x: (rng() - 0.5) * 0.16, y: mix(0.02, 0.58, rng()), z: (rng() - 0.5) * 0.2, radius: 0.55 };
    const branches = [[-0.33, -0.1, 0.31, 0.23], [0.29, -0.11, 0.31, 0.24], [0, -0.34, 0.34, 0.27], [0, -0.05, 0.38, 0.28]];
    return volume(rng, ...branches[index % branches.length], 0.35);
  }
  if (name === 'dragon') {
    if (section < 0.34) return volume(rng, 0.1, 0.14, 0.32, 0.17, 0.3);
    if (section < 0.55) return along(rng, [[-0.07, 0.14], [-0.32, 0.34], [-0.65, 0.31], [-0.89, 0.08], [-0.86, -0.12]], 0.11);
    if (section < 0.74) {
      const p = volume(rng, -0.1, -0.28, 0.38, 0.32, 0.16);
      p.x -= Math.max(0, -p.y) * 0.32;
      p.radius = 0.67;
      return p;
    }
    if (section < 0.88) return along(rng, [[0.29, 0.11], [0.37, -0.18], [0.49, -0.39], [0.68, -0.4], [0.81, -0.3]], 0.13);
    return along(rng, [[0.02, 0.22], [-0.05, 0.47], [0.08, 0.45], [0.3, 0.23], [0.4, 0.43], [0.55, 0.4]], 0.07);
  }
  return sampleShape('cloud', rng, index, count);
}

function sampleCustomShape(input) {
  const kind = input?.kind === 'glyph' ? 'glyph' : 'text';
  const value = Array.from(String(input?.value ?? '').trim()).slice(0, 96).join('');
  if (!value) return null;
  const mask = document.createElement('canvas');
  mask.width = 1024;
  mask.height = 640;
  const ctx = mask.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kind === 'glyph') {
    ctx.font = '500px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.fillText(value, 512, 320, 870);
  } else {
    const words = value.replace(/\s+/g, ' ').split(' ');
    const lines = [''];
    for (const word of words) {
      const current = lines.length - 1;
      if (lines[current] && (lines[current] + ' ' + word).length > 22 && lines.length < 3) lines.push(word);
      else lines[current] += (lines[current] ? ' ' : '') + word;
    }
    const family = '"Avenir Next", "DejaVu Sans", Arial, sans-serif';
    ctx.font = `900 160px ${family}`;
    const measured = Math.max(...lines.map(line => ctx.measureText(line).width));
    const font = Math.min(190, 160 * 875 / Math.max(measured, 1), 480 / (lines.length * 1.15));
    ctx.font = `900 ${font}px ${family}`;
    lines.forEach((line, i) => ctx.fillText(line, 512, 320 + (i - (lines.length - 1) / 2) * font * 1.15));
  }
  const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
  const hits = [];
  let left = mask.width;
  let right = 0;
  let top = mask.height;
  let bottom = 0;
  for (let y = 0; y < mask.height; y += 2) {
    for (let x = 0; x < mask.width; x += 2) {
      if (pixels[(y * mask.width + x) * 4 + 3] < 48) continue;
      hits.push(x, y);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (!hits.length) return null;
  const scale = Math.min(1.82 / Math.max(1, right - left), 1.24 / Math.max(1, bottom - top));
  const points = new Float32Array(hits.length);
  for (let i = 0; i < hits.length; i += 2) {
    points[i] = (hits[i] - (left + right) / 2) * scale;
    points[i + 1] = (hits[i + 1] - (top + bottom) / 2) * scale;
  }
  const art = document.createElement('canvas');
  art.width = right - left + 4;
  art.height = bottom - top + 4;
  const artContext = art.getContext('2d');
  artContext.drawImage(mask, left - 2, top - 2, art.width, art.height, 0, 0, art.width, art.height);
  artContext.globalCompositeOperation = 'source-in';
  const smoke = artContext.createLinearGradient(0, 0, art.width * 0.35, art.height);
  smoke.addColorStop(0, '#faf7ff');
  smoke.addColorStop(0.5, '#dcd4f5');
  smoke.addColorStop(1, '#aca0d5');
  artContext.fillStyle = smoke;
  artContext.fillRect(0, 0, art.width, art.height);
  return { metadata: { kind, value, label: String(input.label || value).slice(0, 120) }, points, art: { canvas: art, width: art.width * scale, height: art.height * scale } };
}

export class CloudRenderer {
  constructor(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('CloudRenderer needs a canvas element.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    if (!this.ctx) throw new Error('A Canvas 2D context is required.');
    this.shape = 'cloud';
    this.atmosphere = 'night';
    this.wind = 0.3;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.motion = !this.reducedMotion;
    this.pointer = { x: 0, y: 0 };
    this.parallax = { x: 0, y: 0 };
    this.disposed = false;
    this.elapsed = 0;
    this.lastFrame = 0;
    this.earthMix = 0;
    this.earthFrom = 0;
    this.earthTarget = 0;
    this.earthLongitude = -25 * Math.PI / 180;
    this.cloudMix = 1;
    this.cloudFrom = 1;
    this.cloudTarget = 1;
    this.customMix = 0;
    this.customFrom = 0;
    this.customTarget = 0;
    this.customArt = null;
    this.detail = 88;
    this.glitter = 1;
    this.customShape = null;
    this.customSamples = null;
    this.glitterSprites = this.makeGlitterSprites();
    this.glitterParticles = [];
    this.count = 370;
    this.particles = [];
    const rng = randomGenerator(137);
    for (let i = 0; i < this.count; i++) {
      const point = sampleShape('cloud', rng, i, this.count);
      this.particles.push({
        ...point, radiusScale: point.radius ?? 1,
        baseRadius: i < 105 ? 0.13 + rng() * 0.1 : 0.037 + rng() * 0.065,
        seed: rng() * TAU, variant: i % 3, alpha: i < 105 ? 0.96 : 0.25 + rng() * 0.25,
      });
    }
    this.sprites = this.makeSprites(this.atmosphere);
    this.from = this.particles.map(p => ({ x: p.x, y: p.y, z: p.z, radius: p.radiusScale }));
    this.target = this.from;
    this.transitionStart = -10000;
    this.onPointer = event => {
      const bounds = this.canvas.getBoundingClientRect();
      this.pointer.x = clamp((event.clientX - bounds.left) / bounds.width - 0.5, -0.5, 0.5);
      this.pointer.y = clamp((event.clientY - bounds.top) / bounds.height - 0.5, -0.5, 0.5);
    };
    this.onPointerLeave = () => { this.pointer.x = 0; this.pointer.y = 0; };
    this.onResize = () => this.resize();
    this.onVisibility = () => {
      if (!document.hidden && !this.disposed) {
        this.lastFrame = 0;
        if (!this.frameId) this.frameId = requestAnimationFrame(t => this.frame(t));
      }
    };
    canvas.addEventListener('pointermove', this.onPointer, { passive: true });
    canvas.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.onResize);
      this.observer.observe(canvas);
    }
    this.resize();
    if (!this.frameId) this.frameId = requestAnimationFrame(t => this.frame(t));
  }

  makeSprites(atmosphere) {
    const palette = palettes[atmosphere];
    const sprites = [];
    for (let shade = 0; shade < 9; shade++) {
      const tones = [];
      const light = rgbMix(palette.shade, palette.light, 0.55 + shade * 0.05);
      const body = rgbMix(palette.shade, palette.body, 0.28 + shade * 0.08);
      for (let variant = 0; variant < 3; variant++) {
        const sprite = document.createElement('canvas');
        sprite.width = 192;
        sprite.height = 192;
        const context = sprite.getContext('2d');
        context.scale(1.2, 1.2);
        const rng = randomGenerator(40 + variant);
        const blobs = [[80, 85, 50], [43, 76, 29], [65, 44, 30], [108, 54, 26], [118, 87, 25], [99, 117, 29], [53, 109, 27]];
        const gradient = context.createRadialGradient(51, 34, 1, 60, 49, 124);
        gradient.addColorStop(0, color(light));
        gradient.addColorStop(0.26, color(rgbMix(light, body, 0.13)));
        gradient.addColorStop(0.58, color(body));
        gradient.addColorStop(0.83, color(rgbMix(body, palette.shade, 0.2)));
        gradient.addColorStop(1, color(rgbMix(body, palette.shade, 0.42)));
        context.fillStyle = gradient;
        context.filter = 'blur(2px)';
        context.beginPath();
        for (const [cx, cy, radius] of blobs) {
          context.moveTo(cx + radius, cy);
          context.arc(cx, cy, radius, 0, TAU);
        }
        context.fill();
        context.filter = 'none';
        context.globalCompositeOperation = 'source-atop';
        for (let i = 0; i < 180; i++) {
          const cx = 25 + rng() * 110;
          const cy = 25 + rng() * 105;
          const radius = 1.5 + rng() * 8;
          const noise = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
          noise.addColorStop(0, color(i % 2 ? palette.light : palette.shade, 0.042));
          noise.addColorStop(1, color(palette.body, 0));
          context.fillStyle = noise;
          context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        }
        tones.push(sprite);
      }
      sprites.push(tones);
    }
    return sprites;
  }

  makeGlitterSprites() {
    return ['#e8d6ff', '#b9eaff', '#ffebcd'].map((tint, variant) => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 32, 32);
      const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 14);
      glow.addColorStop(0, '#fff');
      glow.addColorStop(0.12, tint);
      glow.addColorStop(0.32, tint + '99');
      glow.addColorStop(1, '#000');
      ctx.fillStyle = glow;
      ctx.fillRect(1, 1, 30, 30);
      ctx.strokeStyle = tint;
      ctx.lineWidth = variant === 1 ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(16, 5 + variant); ctx.lineTo(16, 27 - variant);
      ctx.moveTo(5 + variant, 16); ctx.lineTo(27 - variant, 16);
      ctx.stroke();
      const image = new Image();
      image.onload = () => { if (!this.disposed) this.render(); };
      // Actual tiny JPEG sprites; screen blending removes their black backdrop.
      image.src = canvas.toDataURL('image/jpeg', 0.97);
      return { canvas, image };
    });
  }

  particleBudget() {
    const mobile = this.width < 600;
    const constrained = (navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
    const areaFactor = mobile ? 1 : clamp(Math.sqrt(500000 / (this.width * this.height)), 0.55, 1);
    const maximum = mobile ? (constrained ? 460 : 700) : Math.round((constrained ? 800 : 1280) * areaFactor);
    const minimum = mobile ? 170 : 250;
    return Math.round(minimum + (maximum - minimum) * this.detail / 100);
  }

  shapeTargets(count) {
    const rng = randomGenerator(137 + supportedShapes.indexOf(this.shape) * 79);
    return Array.from({ length: count }, (_, i) => {
      if (this.shape === 'custom' && this.customSamples?.length) {
        const index = Math.floor(rng() * (this.customSamples.length / 2)) * 2;
        return { x: this.customSamples[index], y: this.customSamples[index + 1], z: (rng() - 0.5) * 0.2, radius: this.customShape.kind === 'glyph' ? 0.20 : 0.15 };
      }
      return sampleShape(this.shape, rng, i, count);
    });
  }

  rebuildParticles(count) {
    const previous = this.particles;
    const targets = this.shapeTargets(count);
    const rng = randomGenerator(7781);
    const mainCount = Math.round(count * 0.21);
    this.particles = targets.map((target, i) => {
      const point = previous[i] || previous[i % Math.max(previous.length, 1)] || target;
      return {
        x: point.x, y: point.y, z: point.z, radiusScale: point.radiusScale ?? point.radius ?? 1,
        baseRadius: i < mainCount ? 0.088 + rng() * 0.089 : 0.012 + rng() * 0.047,
        seed: rng() * TAU, variant: i % 3,
        alpha: i < mainCount ? 0.97 : 0.22 + rng() * 0.30,
      };
    });
    this.count = count;
    this.from = this.particles.map(p => ({ x: p.x, y: p.y, z: p.z, radius: p.radiusScale }));
    this.target = targets;
    this.earthFrom = this.earthMix;
    this.earthTarget = this.shape === 'earth' ? 1 : 0;
    this.cloudFrom = this.cloudMix;
    this.cloudTarget = this.shape === 'cloud' ? 1 : 0;
    this.customFrom = this.customMix;
    this.customTarget = this.shape === 'custom' ? 1 : 0;
    this.transitionStart = performance.now();
    this.glitterParticles = Array.from({ length: Math.round(count * 0.92) }, (_, i) => ({
      owner: i % count, x: (rng() - 0.5) * 0.034, y: (rng() - 0.5) * 0.034,
      phase: rng() * TAU, rate: 0.9 + rng() * 2.2, size: i % 23 === 0 ? 11 + rng() * 7 : 3.2 + rng() * 5.5,
      variant: i % 3,
    }));
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || 800);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight || 450);
    // Fullscreen high-DPI overdraw can dominate raster time; cap both DPR and area.
    const pixelBudget = (navigator.deviceMemory || 8) <= 2 ? 1500000 : 2600000;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(pixelBudget / (this.width * this.height)));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.cloudLayer ||= { canvas: document.createElement('canvas') };
    this.cloudLayer.dpr = Math.min(1, Math.sqrt(1000000 / (this.width * this.height)));
    this.cloudLayer.canvas.width = Math.round(this.width * this.cloudLayer.dpr);
    this.cloudLayer.canvas.height = Math.round(this.height * this.cloudLayer.dpr);
    this.cloudLayer.context = this.cloudLayer.canvas.getContext('2d');
    this.scale = Math.min(this.width * 0.47, this.height * 0.82);
    this.cloudStretch = clamp(this.height / this.width * 1.5, 1, 3.65);
    this.frameInterval = this.width < 600 || (navigator.hardwareConcurrency || 8) <= 2 ? 30 : 15;
    const count = this.particleBudget();
    if (this.count !== count) this.rebuildParticles(count);
    this.render();
    if (!this.frameId && !this.disposed) this.frameId = requestAnimationFrame(t => this.frame(t));
  }

  setShape(name) {
    const next = String(name || 'cloud').toLowerCase();
    this.shape = supportedShapes.includes(next) && (next !== 'custom' || this.customSamples?.length) ? next : 'cloud';
    this.earthFrom = this.earthMix;
    this.earthTarget = this.shape === 'earth' ? 1 : 0;
    this.cloudFrom = this.cloudMix;
    this.cloudTarget = this.shape === 'cloud' ? 1 : 0;
    this.customFrom = this.customMix;
    this.customTarget = this.shape === 'custom' ? 1 : 0;
    this.from = this.particles.map(p => ({ x: p.x, y: p.y, z: p.z, radius: p.radiusScale }));
    this.target = this.shapeTargets(this.count);
    this.transitionStart = performance.now();
    if (!this.frameId && !this.disposed) this.frameId = requestAnimationFrame(t => this.frame(t));
    return this.shape;
  }

  setCustomShape(input) {
    const sampled = sampleCustomShape(input);
    if (!sampled) return this.setShape('cloud');
    this.customShape = sampled.metadata;
    this.customSamples = sampled.points;
    this.previousCustomArt = this.customArt;
    this.previousCustomOpacity = this.shape === 'custom' ? this.customMix : 0;
    this.customArt = sampled.art;
    this.customMix = 0;
    return this.setShape('custom');
  }

  setDetail(value) {
    const number = Number(value);
    if (Number.isFinite(number)) this.detail = clamp(number, 0, 100);
    const count = this.particleBudget();
    if (count !== this.count) this.rebuildParticles(count);
    this.render();
    if (!this.frameId && !this.disposed) this.frameId = requestAnimationFrame(t => this.frame(t));
    return this.detail;
  }

  setGlitter(value) {
    const number = typeof value === 'boolean' ? Number(value) : Number(value);
    if (Number.isFinite(number)) this.glitter = clamp(number > 1 ? number / 100 : number, 0, 1);
    this.render();
    return this.glitter;
  }

  setAtmosphere(name) {
    this.atmosphere = Object.hasOwn(palettes, name) ? name : 'night';
    this.sprites = this.makeSprites(this.atmosphere);
    this.render();
    return this.atmosphere;
  }

  setWind(value) {
    const amount = Number(value);
    this.wind = clamp(Number.isFinite(amount) ? (amount > 1 ? amount / 100 : amount) : 0.3, 0, 1);
  }

  setMotion(enabled) {
    this.motion = Boolean(enabled);
    if (!this.frameId && !this.disposed) this.frameId = requestAnimationFrame(t => this.frame(t));
  }

  frame(now) {
    this.frameId = null;
    if (this.disposed || document.hidden) return;
    if (this.lastPaint && now - this.lastPaint < this.frameInterval) {
      this.frameId = requestAnimationFrame(t => this.frame(t));
      return;
    }
    this.lastPaint = now;
    const delta = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = now;
    if (this.motion) this.elapsed += delta;
    const duration = this.reducedMotion ? 350 : 1750;
    const progress = clamp((now - this.transitionStart) / duration, 0, 1);
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    this.earthMix = mix(this.earthFrom, this.earthTarget, eased);
    this.cloudMix = mix(this.cloudFrom, this.cloudTarget, eased);
    this.customMix = mix(this.customFrom, this.customTarget, eased);
    this.customTransition = eased;
    if (progress === 1) {
      this.previousCustomArt = null;
      this.previousCustomOpacity = 0;
    }
    if (this.motion && this.earthMix > 0) this.earthLongitude += delta * 0.032;
    for (let i = 0; i < this.count; i++) {
      const point = this.particles[i];
      const from = this.from[i];
      const to = this.target[i];
      point.x = mix(from.x, to.x, eased);
      point.y = mix(from.y, to.y, eased);
      point.z = mix(from.z, to.z, eased);
      point.radiusScale = mix(from.radius ?? 1, to.radius ?? 1, eased);
    }
    this.parallax.x = mix(this.parallax.x, this.motion ? this.pointer.x : 0, 0.035);
    this.parallax.y = mix(this.parallax.y, this.motion ? this.pointer.y : 0, 0.035);
    this.render();
    if (this.motion || progress < 1) this.frameId = requestAnimationFrame(t => this.frame(t));
  }

  render() {
    if (!this.ctx || !this.width) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const t = this.elapsed;
    const movement = 0.004 + this.wind * 0.017;
    const cx = this.width / 2 + this.parallax.x * 18;
    const cy = this.height * 0.51 + this.parallax.y * 12 + (this.motion ? Math.sin(t * 0.47) * 5 : 0);
    const scale = this.scale;
    const stretch = mix(1, this.cloudStretch, this.cloudMix);
    const palette = palettes[this.atmosphere];
    const glow = ctx.createRadialGradient(cx, cy + scale * 0.06, scale * 0.08, cx, cy, scale * 1.05);
    glow.addColorStop(0, color(palette.glow, 0.11));
    glow.addColorStop(0.6, color(palette.glow, 0.025));
    glow.addColorStop(1, color(palette.glow, 0));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.2, 0.62);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = glow;
    ctx.fillRect(cx - scale * 1.1, cy - scale * 1.1, scale * 2.2, scale * 2.2);
    ctx.restore();
    if (this.earthMix > 0.001) this.drawEarth(cx, cy, scale, this.earthMix);
    if (this.customMix > 0 || (this.previousCustomArt && this.previousCustomOpacity > 0)) {
      const paint = (art, opacity) => {
        if (!art || opacity <= 0) return;
        ctx.globalAlpha = opacity * 0.74;
        ctx.drawImage(art.canvas, cx - art.width * scale / 2, cy - art.height * scale / 2, art.width * scale, art.height * scale);
      };
      paint(this.previousCustomArt, this.previousCustomOpacity * (1 - (this.customTransition ?? 0)));
      paint(this.customArt, this.customMix);
      ctx.globalAlpha = 1;
    }
    if (this.earthMix < 0.999) {
      // Soft volumes use their own bounded raster; sharp glitter stays at canvas DPR.
      const cloudCtx = this.cloudLayer.context;
      cloudCtx.setTransform(this.cloudLayer.dpr, 0, 0, this.cloudLayer.dpr, 0, 0);
      cloudCtx.clearRect(0, 0, this.width, this.height);
      const ordered = [...this.particles].sort((a, b) => a.z - b.z);
      for (const particle of ordered) {
        const wave = this.motion ? Math.sin(t * (0.24 + this.wind * 0.35) + particle.seed) : 0;
        const x = cx + (particle.x + wave * movement + particle.z * this.parallax.x * 0.04) * scale;
        const y = cy + (particle.y * stretch + Math.cos(t * 0.34 + particle.seed) * movement * (this.motion ? 1 : 0) + particle.z * this.parallax.y * 0.04) * scale;
        const radius = particle.baseRadius * particle.radiusScale * scale * Math.sqrt(stretch) * (1 + particle.z * 0.19 + wave * 0.025);
        const shade = clamp(Math.round(4.5 - particle.y * 7 + particle.z * 2.5), 0, 8);
        cloudCtx.globalAlpha = particle.alpha * (1 - this.earthMix);
        cloudCtx.drawImage(this.sprites[shade][particle.variant], x - radius * 1.22, y - radius * 1.22, radius * 2.44, radius * 2.44);
      }
      cloudCtx.globalAlpha = 1;
      ctx.drawImage(this.cloudLayer.canvas, 0, 0, this.width, this.height);
    }
    ctx.globalAlpha = 1;
    if (this.glitter > 0) this.drawGlitter(cx, cy, scale, stretch);
  }

  drawGlitter(cx, cy, scale, stretch) {
    const ctx = this.ctx;
    const t = this.elapsed;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const sparkle of this.glitterParticles) {
      const point = this.particles[sparkle.owner];
      const shimmer = 0.16 + 0.84 * Math.pow((Math.sin(t * sparkle.rate + sparkle.phase) + 1) / 2, 7);
      const x = cx + (point.x + sparkle.x + Math.sin(t * 0.32 + sparkle.phase) * 0.006) * scale;
      const y = cy + (point.y * stretch + sparkle.y + Math.cos(t * 0.29 + sparkle.phase) * 0.006) * scale;
      const sprite = this.glitterSprites[sparkle.variant];
      const size = sparkle.size * (0.76 + shimmer * 0.45);
      ctx.globalAlpha = this.glitter * shimmer * (0.64 - this.earthMix * 0.43);
      ctx.drawImage(sprite.image.complete && sprite.image.naturalWidth ? sprite.image : sprite.canvas, x - size / 2, y - size / 2, size, size);
    }
    ctx.restore();
  }

  prepareEarthProjection(size) {
    this.earthTexture ||= makeEarthTexture();
    const surface = document.createElement('canvas');
    surface.width = size;
    surface.height = size;
    const context = surface.getContext('2d');
    const pixels = context.createImageData(size, size);
    const capacity = size * size;
    const projection = {
      offset: new Int32Array(capacity), u: new Float32Array(capacity), row: new Int32Array(capacity),
      light: new Float32Array(capacity), specular: new Float32Array(capacity),
      air: new Float32Array(capacity), alpha: new Uint8Array(capacity), count: 0,
    };
    const tilt = 16 * Math.PI / 180;
    const cosTilt = Math.cos(tilt);
    const sinTilt = Math.sin(tilt);
    const radius = size / 2 - 1;
    for (let y = 0; y < size; y++) {
      const ny = (y + 0.5 - size / 2) / radius;
      for (let x = 0; x < size; x++) {
        const nx = (x + 0.5 - size / 2) / radius;
        const distance = nx * nx + ny * ny;
        if (distance > 1) continue;
        const nz = Math.sqrt(1 - distance);
        const latitude = Math.asin(-ny * cosTilt + nz * sinTilt);
        const longitude = Math.atan2(nx, ny * sinTilt + nz * cosTilt);
        const light = nx * -0.57 + ny * -0.46 + nz * 0.68;
        const half = Math.max(0, nx * -0.315 + ny * -0.254 + nz * 0.913);
        const i = projection.count++;
        projection.offset[i] = (y * size + x) * 4;
        projection.u[i] = (longitude / TAU + 0.5) * this.earthTexture.width;
        projection.row[i] = clamp(Math.floor((0.5 - latitude / Math.PI) * this.earthTexture.height), 0, this.earthTexture.height - 1) * this.earthTexture.width * 4;
        projection.light[i] = 0.18 + 0.87 * Math.max(0, light);
        projection.specular[i] = Math.pow(half, 28) * 42;
        projection.air[i] = Math.pow(1 - nz, 3) * (0.25 + Math.max(0, light) * 0.75);
        projection.alpha[i] = Math.round(clamp((1 - Math.sqrt(distance)) * radius, 0, 1) * 255);
      }
    }
    this.earthSurface = { canvas: surface, context, pixels, projection, size };
    this.earthLastAngle = NaN;
  }

  drawEarth(cx, cy, scale, opacity) {
    const ctx = this.ctx;
    const radius = Math.min(scale * 0.72, this.height * 0.355, this.width * 0.32);
    const resolution = Math.round(clamp(radius * this.dpr * 2, 220, this.width < 600 ? 512 : 768));
    if (!this.earthSurface || this.earthSurface.size !== resolution) this.prepareEarthProjection(resolution);
    const angle = this.earthLongitude + this.parallax.x * 0.25;
    if (!Number.isFinite(this.earthLastAngle) || Math.abs(angle - this.earthLastAngle) > 0.0015) {
      const { pixels, projection, context } = this.earthSurface;
      const source = this.earthTexture.pixels;
      const output = pixels.data;
      const width = this.earthTexture.width;
      // A cached spherical projection keeps rotation inexpensive on mobile.
      const offset = ((angle / TAU * width) % width + width) % width;
      for (let i = 0; i < projection.count; i++) {
        const u = Math.floor(projection.u[i] + offset) % width;
        const index = projection.row[i] + u * 4;
        const target = projection.offset[i];
        const light = projection.light[i];
        const air = projection.air[i];
        const ocean = source[index + 2] > source[index + 1] * 1.1 && source[index] < source[index + 2] * 0.65;
        const reflection = ocean ? projection.specular[i] : 0;
        output[target] = source[index] * light + reflection + air * 21;
        output[target + 1] = source[index + 1] * light + reflection * 0.94 + air * 104;
        output[target + 2] = source[index + 2] * light + reflection * 0.78 + air * 174;
        output[target + 3] = projection.alpha[i];
      }
      context.putImageData(pixels, 0, 0);
      this.earthLastAngle = angle;
    }
    ctx.save();
    ctx.globalAlpha = opacity;
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.74, cx, cy, radius * 1.13);
    halo.addColorStop(0, 'rgba(105,184,255,0)');
    halo.addColorStop(0.58, 'rgba(91,177,255,0.06)');
    halo.addColorStop(0.76, 'rgba(122,207,255,0.30)');
    halo.addColorStop(1, 'rgba(73,143,252,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.14, 0, TAU);
    ctx.fill();
    ctx.drawImage(this.earthSurface.canvas, cx - radius, cy - radius, radius * 2, radius * 2);
    // A fine blue atmosphere defines the limb without giving Earth a ring.
    ctx.strokeStyle = 'rgba(151,220,255,0.30)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.995, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  capture() {
    this.render();
    return this.canvas.toDataURL('image/png');
  }

  dispose() {
    this.disposed = true;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.observer?.disconnect();
    this.canvas.removeEventListener('pointermove', this.onPointer);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const sprite of this.glitterSprites) sprite.image.onload = null;
  }
}

export default CloudRenderer;
