/**
 * Cloudy's dependency-free, transparent cloud sculpture.
 * import CloudRenderer, { supportedShapes } from './renderer.js';
 * const cloudy = new CloudRenderer(document.querySelector('canvas'));
 * cloudy.setShape('heart'); cloudy.setAtmosphere('sunset');
 */
export const supportedShapes = Object.freeze([
  'cloud', 'heart', 'planet', 'galaxy', 'mountain', 'castle', 'tree', 'dragon',
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
    this.frameId = requestAnimationFrame(t => this.frame(t));
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
        sprite.width = 160;
        sprite.height = 160;
        const context = sprite.getContext('2d');
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
        for (let i = 0; i < 100; i++) {
          const cx = 25 + rng() * 110;
          const cy = 25 + rng() * 105;
          const radius = 3 + rng() * 12;
          const noise = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
          noise.addColorStop(0, color(i % 2 ? palette.light : palette.shade, 0.025));
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

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || this.canvas.clientWidth || 800);
    this.height = Math.max(1, rect.height || this.canvas.clientHeight || 450);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.scale = Math.min(this.width * 0.43, this.height * 0.62);
    this.render();
  }

  setShape(name) {
    const next = String(name || 'cloud').toLowerCase();
    this.shape = supportedShapes.includes(next) ? next : 'cloud';
    this.from = this.particles.map(p => ({ x: p.x, y: p.y, z: p.z, radius: p.radiusScale }));
    const rng = randomGenerator(137 + supportedShapes.indexOf(this.shape) * 79);
    this.target = this.particles.map((_, i) => sampleShape(this.shape, rng, i, this.count));
    this.transitionStart = performance.now();
    if (!this.frameId && !this.disposed) this.frameId = requestAnimationFrame(t => this.frame(t));
    return this.shape;
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
    const delta = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = now;
    if (this.motion) this.elapsed += delta;
    const duration = this.reducedMotion ? 350 : 1750;
    const progress = clamp((now - this.transitionStart) / duration, 0, 1);
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;
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
    const ordered = [...this.particles].sort((a, b) => a.z - b.z);
    for (const particle of ordered) {
      const wave = this.motion ? Math.sin(t * (0.24 + this.wind * 0.35) + particle.seed) : 0;
      const x = cx + (particle.x + wave * movement + particle.z * this.parallax.x * 0.04) * scale;
      const y = cy + (particle.y + Math.cos(t * 0.34 + particle.seed) * movement * (this.motion ? 1 : 0) + particle.z * this.parallax.y * 0.04) * scale;
      const radius = particle.baseRadius * particle.radiusScale * scale * (1 + particle.z * 0.19 + wave * 0.025);
      const shade = clamp(Math.round(4.5 - particle.y * 7 + particle.z * 2.5), 0, 8);
      ctx.globalAlpha = particle.alpha;
      ctx.drawImage(this.sprites[shade][particle.variant], x - radius * 1.22, y - radius * 1.22, radius * 2.44, radius * 2.44);
    }
    ctx.globalAlpha = 1;
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
  }
}

export default CloudRenderer;
