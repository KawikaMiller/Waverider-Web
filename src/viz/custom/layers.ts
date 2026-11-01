import type { AudioFrame } from "../../audio/frame";
import { css, hsv, lerp, parseHex, RGB, toHsv } from "../../color";
import type { Theme } from "../../theme/theme";
import { evalParam, LayerSettings } from "./model";

type Ctx = CanvasRenderingContext2D;
type DrawFn = (cv: Ctx) => void;

export interface LayerContext {
  ctx: Ctx;
  w: number;
  h: number;
  frame: AudioFrame;
  theme: Theme;
  time: number;
  dt: number;
  hueShift: number;
  /** Scratch canvas for glow passes, shared by every layer. */
  glow: GlowSurface;
}

/** A half-resolution canvas the glow pass draws into before it is blurred onto the picture. */
export class GlowSurface {
  readonly canvas = document.createElement("canvas");
  readonly ctx = this.canvas.getContext("2d")!;
  resize(w: number, h: number): void {
    const gw = Math.max(1, Math.round(w / 2)), gh = Math.max(1, Math.round(h / 2));
    if (this.canvas.width !== gw || this.canvas.height !== gh) {
      this.canvas.width = gw;
      this.canvas.height = gh;
    }
  }
}

// Per-layer render state that isn't part of the saved settings.
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; t: number }
interface Runtime { angle: number; spawn: number; particles: Particle[] }
const runtimes = new WeakMap<LayerSettings, Runtime>();
const runtimeOf = (l: LayerSettings): Runtime => {
  let rt = runtimes.get(l);
  if (!rt) runtimes.set(l, (rt = { angle: 0, spawn: 0, particles: [] }));
  return rt;
};

/** Resolves a 0..1 position along a layer to a color for the layer's color mode. */
class Palette {
  private readonly a: RGB;
  private readonly b: RGB;
  private readonly hue: number;

  constructor(theme: Theme, private readonly mode: LayerSettings["colorMode"], layerHue: number, cycle: number, private readonly opacity: number) {
    this.a = parseHex(theme.primary);
    this.b = parseHex(theme.secondary);
    this.hue = layerHue + cycle;
  }

  at(t: number, alpha = 1): string {
    let c: RGB;
    switch (this.mode) {
      case "Rainbow": c = hsv(this.hue + t * 300, 0.85, 1); break;
      case "Solid": c = hsv(this.hue, 0.85, 1); break;
      default: {
        c = lerp(this.a, this.b, t);
        if (Math.abs(this.hue % 360) > 0.5) {
          const { h, s, v } = toHsv(c);
          c = hsv(h + this.hue, s, v);
        }
      }
    }
    return css(c, Math.min(1, Math.max(0, alpha * this.opacity)));
  }
}

export function drawLayer(c: LayerContext, layer: LayerSettings): void {
  const { frame: f, w, h } = c;
  const rt = runtimeOf(layer);
  const cx = w / 2, cy = h / 2, m = Math.min(w, h);
  const get = (key: string) => evalParam(layer.params, key, f);

  const glow = get("glow");
  rt.angle = (rt.angle + get("spin") * c.dt) % 360;
  const pal = new Palette(c.theme, layer.colorMode, get("hue"), c.hueShift, get("opacity"));

  // Generators compute their per-frame state first and return a pure draw function, so the glow pass
  // and the main pass can both run it without side effects.
  let draw: DrawFn | null;
  switch (layer.kind) {
    case "Bars": draw = bars(get, f, pal, w, h); break;
    case "Wave": draw = wave(get, f, pal, w, h); break;
    case "Radial": draw = radial(get, f, pal, cx, cy, m); break;
    case "Rings": draw = rings(get, f, pal, cx, cy, m); break;
    case "Scope": draw = scope(get, f, pal, cx, cy, m); break;
    case "Particles": draw = particles(get, f, pal, rt, c.dt, cx, cy, m, w, h); break;
    case "Blobs": draw = blobs(get, f, pal, c.time, cx, cy, w, h, m); break;
  }
  if (!draw) return;

  const angle = (rt.angle * Math.PI) / 180;
  const rotated = (cv: Ctx, scale: number) => {
    cv.save();
    cv.scale(scale, scale);
    cv.translate(cx, cy);
    cv.rotate(angle);
    cv.translate(-cx, -cy);
    cv.lineCap = "round";
    cv.lineJoin = "round";
  };

  if (glow > 0.02) {
    c.glow.resize(w, h);
    const g = c.glow.ctx;
    g.clearRect(0, 0, c.glow.canvas.width, c.glow.canvas.height);
    g.globalCompositeOperation = "lighter";
    rotated(g, 0.5);
    draw(g);
    g.restore();

    const sigma = 2 + glow * 12;
    c.ctx.save();
    c.ctx.globalCompositeOperation = "lighter";
    c.ctx.globalAlpha = Math.min(1, glow * 1.2);
    c.ctx.filter = `blur(${sigma}px)`;
    c.ctx.drawImage(c.glow.canvas, 0, 0, w, h);
    c.ctx.restore();
  }

  c.ctx.save();
  c.ctx.globalCompositeOperation = layer.additive ? "lighter" : "source-over";
  rotated(c.ctx, 1);
  draw(c.ctx);
  c.ctx.restore();
  c.ctx.restore();
}

/** Resamples the spectrum bands to n values, taking the peak of each group. */
function resample(src: Float32Array, n: number): Float32Array {
  const dst = new Float32Array(n);
  if (src.length === 0) return dst;
  for (let i = 0; i < n; i++) {
    const lo = Math.floor((i * src.length) / n);
    const hi = Math.max(lo + 1, Math.floor(((i + 1) * src.length) / n));
    let peak = 0;
    for (let j = lo; j < hi && j < src.length; j++) peak = Math.max(peak, src[j]);
    dst[i] = peak;
  }
  return dst;
}

type Get = (key: string) => number;
const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.trunc(v)));

function bars(get: Get, f: AudioFrame, pal: Palette, w: number, h: number): DrawFn {
  const n = clampInt(get("count"), 3, 128);
  const size = get("size"), thick = get("thickness"), amp = get("amplitude");
  const vals = resample(f.bands, n);
  return (cv) => {
    const slot = w / n;
    cv.lineWidth = Math.min(thick, slot * 0.9);
    const maxHalf = size * h * 0.5;
    for (let i = 0; i < n; i++) {
      const len = Math.max(1, vals[i] * amp * maxHalf);
      const x = slot * (i + 0.5);
      cv.strokeStyle = pal.at(i / (n - 1), 0.4 + 0.6 * vals[i]);
      cv.beginPath();
      cv.moveTo(x, h / 2 - len);
      cv.lineTo(x, h / 2 + len);
      cv.stroke();
    }
  };
}

function wave(get: Get, f: AudioFrame, pal: Palette, w: number, h: number): DrawFn | null {
  const samples = f.samples;
  if (samples.length === 0) return null;
  const size = get("size"), amp = get("amplitude"), thick = get("thickness");
  const points = 240;
  return (cv) => {
    cv.beginPath();
    for (let j = 0; j < points; j++) {
      const u = j / (points - 1);
      const s = samples[Math.trunc(u * (samples.length - 1))];
      const x = u * w, y = h / 2 + s * amp * size * h * 1.5;
      if (j === 0) cv.moveTo(x, y);
      else cv.lineTo(x, y);
    }
    const grad = cv.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, pal.at(0));
    grad.addColorStop(0.5, pal.at(0.5));
    grad.addColorStop(1, pal.at(1));
    cv.strokeStyle = grad;
    cv.lineWidth = thick;
    cv.stroke();
  };
}

function radial(get: Get, f: AudioFrame, pal: Palette, cx: number, cy: number, m: number): DrawFn {
  const n = clampInt(get("count"), 3, 128);
  const r0 = get("size") * m * 0.5, amp = get("amplitude"), thick = get("thickness");
  // Mirror the spectrum around the circle so the seam at angle 0 has no jump.
  const half = resample(f.bands, Math.floor(n / 2) + 1);
  return (cv) => {
    cv.lineWidth = thick;
    for (let i = 0; i < n; i++) {
      const v = half[i <= n / 2 ? i : n - i];
      const len = Math.max(1, v * amp * m * 0.35);
      const a = (i / n) * Math.PI * 2;
      const cos = Math.cos(a), sin = Math.sin(a);
      cv.strokeStyle = pal.at(i / n, 0.4 + 0.6 * v);
      cv.beginPath();
      cv.moveTo(cx + cos * r0, cy + sin * r0);
      cv.lineTo(cx + cos * (r0 + len), cy + sin * (r0 + len));
      cv.stroke();
    }
  };
}

function rings(get: Get, f: AudioFrame, pal: Palette, cx: number, cy: number, m: number): DrawFn {
  const n = clampInt(get("count"), 1, 40);
  const rMax = get("size") * m * 0.5, amp = get("amplitude"), thick = get("thickness");
  const vals = resample(f.bands, n);
  return (cv) => {
    for (let i = 0; i < n; i++) {
      const v = vals[i];
      const r = (rMax * (i + 1)) / n + v * amp * m * 0.06;
      cv.lineWidth = thick * (0.5 + v);
      cv.strokeStyle = pal.at(n === 1 ? 0 : i / (n - 1), 0.3 + 0.7 * v);
      cv.beginPath();
      cv.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);
      cv.stroke();
    }
  };
}

function scope(get: Get, f: AudioFrame, pal: Palette, cx: number, cy: number, m: number): DrawFn | null {
  const samples = f.samples;
  if (samples.length === 0) return null;
  const r0 = get("size") * m * 0.5, amp = get("amplitude"), thick = get("thickness");
  const points = 180;
  return (cv) => {
    cv.beginPath();
    for (let j = 0; j < points; j++) {
      const u = j / points;
      const s = samples[Math.trunc(u * (samples.length - 1))];
      const r = r0 + s * amp * m * 0.5;
      const a = u * Math.PI * 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (j === 0) cv.moveTo(x, y);
      else cv.lineTo(x, y);
    }
    cv.closePath();
    const grad = cv.createConicGradient(0, cx, cy);
    [0, 0.33, 0.66, 1, 0].forEach((t, i) => grad.addColorStop(i / 4, pal.at(t)));
    cv.strokeStyle = grad;
    cv.lineWidth = thick;
    cv.stroke();
  };
}

function particles(
  get: Get, f: AudioFrame, pal: Palette, rt: Runtime, dt: number, cx: number, cy: number, m: number, w: number, h: number,
): DrawFn {
  const n = get("count"), spawnRadius = get("size") * m * 0.5, amp = get("amplitude"), radius = get("thickness");

  // Bursts on beats, plus a trickle driven by mid energy.
  rt.spawn += n * (f.beat * dt * 60 * 0.15 + f.mid * dt * 0.6);
  const spawn = Math.trunc(rt.spawn);
  rt.spawn -= spawn;
  for (let i = 0; i < spawn && rt.particles.length < 800; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * spawnRadius;
    const speed = m * amp * (0.15 + Math.random() * 0.45) * (0.5 + f.beat);
    const life = 1.2 + Math.random() * 0.8;
    rt.particles.push({
      x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life, maxLife: life, t: Math.random(),
    });
  }

  const drag = Math.pow(0.97, dt * 60);
  rt.particles = rt.particles.filter((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= drag;
    p.vy *= drag;
    p.life -= dt;
    return p.life > 0 && p.x > -50 && p.x < w + 50 && p.y > -50 && p.y < h + 50;
  });

  const list = rt.particles;
  return (cv) => {
    for (const p of list) {
      const life = p.life / p.maxLife;
      cv.fillStyle = pal.at(p.t, life);
      cv.beginPath();
      cv.arc(p.x, p.y, Math.max(0.5, radius * (0.4 + life * 0.6)), 0, Math.PI * 2);
      cv.fill();
    }
  };
}

function blobs(get: Get, f: AudioFrame, pal: Palette, time: number, cx: number, cy: number, w: number, h: number, m: number): DrawFn {
  const n = clampInt(get("count"), 1, 12);
  const size = get("size"), amp = get("amplitude");
  const vals = resample(f.bands, n);
  return (cv) => {
    for (let i = 0; i < n; i++) {
      const phase = i * 2.399; // the golden angle keeps the orbs spread out
      const x = cx + Math.sin(time * (0.21 + 0.03 * i) + phase) * w * 0.32;
      const y = cy + Math.cos(time * (0.27 + 0.02 * i) + phase * 1.3) * h * 0.32;
      const r = Math.max(1, m * size * (0.35 + vals[i] * amp * 0.9));
      const t = n === 1 ? 0 : i / (n - 1);
      const grad = cv.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, pal.at(t));
      grad.addColorStop(1, pal.at(t, 0));
      cv.fillStyle = grad;
      cv.beginPath();
      cv.arc(x, y, r, 0, Math.PI * 2);
      cv.fill();
    }
  };
}
