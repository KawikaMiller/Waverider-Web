import type { AudioFrame } from "../audio/frame";
import { parseHex, css } from "../color";
import type { Theme } from "../theme/theme";
import type { Visualizer } from "../viz/types";

export type DiscSkin = "Vinyl" | "Cd";
export type DiscFace = "Art" | "Visualizer";

type Ctx = CanvasRenderingContext2D;

// Proportions as fractions of the disc radius.
const VINYL_LABEL = 0.36;
const VINYL_HOLE = 0.03;
const CD_HOLE = 0.125;
const CD_HUB_OUTER = 0.3; // clear plastic hub
const CD_MIRROR_OUTER = 0.36; // reflective mirror band; the printed area starts here
const CD_RIM = 0.975;

const rgba = (r: number, g: number, b: number, a = 255) => `rgba(${r},${g},${b},${a / 255})`;

/** Disc centre and radius for a square canvas, leaving a margin for the drop shadow. */
function geometry(size: number): { cx: number; cy: number; r: number } {
  return { cx: size / 2, cy: size / 2, r: size * 0.455 };
}

const holeRadius = (skin: DiscSkin, r: number) => r * (skin === "Cd" ? CD_HOLE : VINYL_HOLE);

function circle(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);
}

function ring(cx: number, cy: number, outer: number, inner: number): Path2D {
  const path = new Path2D();
  path.arc(cx, cy, outer, 0, Math.PI * 2);
  path.moveTo(cx + inner, cy);
  path.arc(cx, cy, inner, 0, Math.PI * 2);
  return path;
}

function cutHole(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  circle(ctx, cx, cy, r);
  ctx.fill();
  ctx.restore();
}

function strokeCircle(ctx: Ctx, cx: number, cy: number, r: number, width: number, color: string): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  circle(ctx, cx, cy, r);
  ctx.stroke();
}

function radialFill(ctx: Ctx, cx: number, cy: number, r: number, stops: Array<[number, string]>): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  circle(ctx, cx, cy, r);
  ctx.fill();
}

// ---- layers ----------------------------------------------------------------------------------------

/** Static drop shadow underneath the disc. */
export function drawShadow(ctx: Ctx, size: number, skin: DiscSkin): void {
  ctx.clearRect(0, 0, size, size);
  const { cx, cy, r } = geometry(size);
  ctx.save();
  ctx.filter = `blur(${r * 0.035}px)`;
  ctx.fillStyle = rgba(0, 0, 0, 120);
  circle(ctx, cx, cy + r * 0.03, r * 0.99);
  ctx.fill();
  ctx.restore();
  cutHole(ctx, cx, cy, holeRadius(skin, r) + 1); // keep the spindle hole see-through
}

/** The part of the disc that rotates. */
export function drawBody(ctx: Ctx, size: number, skin: DiscSkin, face: DiscFace, theme: Theme): void {
  ctx.clearRect(0, 0, size, size);
  const { cx, cy, r } = geometry(size);
  const a = parseHex(theme.primary), b = parseHex(theme.secondary);
  const accent = css(a), accent2 = css(b);
  if (skin === "Cd") drawCd(ctx, cx, cy, r, accent, accent2, face === "Visualizer");
  else drawVinyl(ctx, cx, cy, r, accent, accent2);
}

/** The ring the visualizer plays in: the grooves on vinyl (label stays clear), the printed face on a CD. */
function visualizerRing(skin: DiscSkin): [number, number] {
  return skin === "Cd" ? [CD_MIRROR_OUTER, CD_RIM] : [VINYL_LABEL * 1.05, 0.985];
}

export function drawDiscVisualizer(ctx: Ctx, size: number, skin: DiscSkin, visualizer: Visualizer, frame: AudioFrame, theme: Theme, t: number): void {
  ctx.clearRect(0, 0, size, size);
  const { cx, cy, r } = geometry(size);
  const [inner, outer] = visualizerRing(skin);

  ctx.save();
  ctx.clip(ring(cx, cy, r * outer, r * inner), "evenodd");
  // The visualizer gets a square the size of the disc, as it would a canvas of its own.
  const side = Math.max(2, Math.round(r * 2));
  ctx.translate(cx - r, cy - r);
  visualizer.render(ctx, side, side, frame, theme, t);
  ctx.restore();
}

/** Static light reflections on top, so the highlight stays put while the disc turns underneath it. */
export function drawSheen(ctx: Ctx, size: number, skin: DiscSkin): void {
  ctx.clearRect(0, 0, size, size);
  const { cx, cy, r } = geometry(size);
  const inner = skin === "Cd" ? CD_MIRROR_OUTER : VINYL_LABEL;
  const outer = skin === "Cd" ? CD_RIM : 0.99;

  ctx.save();
  ctx.clip(ring(cx, cy, r * outer, r * inner), "evenodd");
  if (skin === "Cd") {
    // Two opposite spectral wedges, like a CD catching a window, plus a faint glint inside each.
    sweep(ctx, cx, cy, r, spectralWedges(0.13, 0.095, 120), "screen");
    sweep(ctx, cx, cy, r, spectralWedges(0.63, 0.095, 120), "screen");
    sweep(ctx, cx, cy, r, whiteWedges([0.13, 0.05, 60], [0.63, 0.05, 60]), "soft-light");
  } else {
    // Soft anisotropic highlights: two broad wedges and two narrower, dimmer ones.
    sweep(ctx, cx, cy, r, whiteWedges([0.13, 0.075, 82], [0.63, 0.075, 82], [0.38, 0.04, 30], [0.88, 0.04, 30]), "screen");
  }
  ctx.restore();
}

// ---- vinyl -----------------------------------------------------------------------------------------

function drawVinyl(ctx: Ctx, cx: number, cy: number, r: number, accent: string, accent2: string): void {
  // Black base with a faint lift toward the middle so it isn't a flat disc.
  radialFill(ctx, cx, cy, r, [[0, rgba(0x24, 0x24, 0x28)], [1, rgba(0x0c, 0x0c, 0x0e)]]);

  // Grooves: concentric hairlines with a stable per-ring brightness so they shimmer, with smooth bands between tracks.
  const grooveStart = r * (VINYL_LABEL + 0.045);
  const grooveEnd = r * 0.965;
  const step = Math.max(1.6, r * 0.0105);
  const n = Math.trunc((grooveEnd - grooveStart) / step);
  const lineWidth = Math.max(0.6, step * 0.42);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    if (inTrackGap(t)) continue;
    const h = Math.imul(i, 2654435761) >>> 24; // 0..255, stable per ring
    strokeCircle(ctx, cx, cy, grooveStart + i * step, lineWidth, rgba(255, 255, 255, 10 + (h % 26)));
  }

  // A few faint scratches fixed to the disc, so rotation is visible even when the label is symmetrical.
  const scratch = (radius: number, startDeg: number, sweepDeg: number, alpha: number) => {
    ctx.lineWidth = Math.max(0.7, r * 0.004);
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba(255, 255, 255, alpha);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, (startDeg * Math.PI) / 180, ((startDeg + sweepDeg) * Math.PI) / 180);
    ctx.stroke();
  };
  scratch(r * 0.58, 20, 38, 46);
  scratch(r * 0.74, 205, 26, 38);
  scratch(r * 0.87, 118, 18, 34);

  strokeCircle(ctx, cx, cy, r * 0.995, Math.max(1, r * 0.008), rgba(255, 255, 255, 38));
  drawVinylLabel(ctx, cx, cy, r, accent, accent2);

  // Spindle hole.
  const hole = r * VINYL_HOLE;
  cutHole(ctx, cx, cy, hole);
  strokeCircle(ctx, cx, cy, hole, Math.max(1, r * 0.006), rgba(200, 205, 212, 150));
}

const inTrackGap = (t: number) =>
  (t > 0.22 && t < 0.235) || (t > 0.47 && t < 0.485) || (t > 0.71 && t < 0.725) || t > 0.965;

function drawVinylLabel(ctx: Ctx, cx: number, cy: number, r: number, accent: string, accent2: string): void {
  const lr = r * VINYL_LABEL;
  ctx.fillStyle = rgba(0, 0, 0, 200); // dark seat ring between the grooves and the label
  circle(ctx, cx, cy, lr * 1.035);
  ctx.fill();

  ctx.save();
  circle(ctx, cx, cy, lr);
  ctx.clip();
  drawFallbackFace(ctx, cx, cy, lr, accent, accent2);
  // Vignette so the label sits in the disc rather than on top of it.
  radialFill(ctx, cx, cy, lr, [[0, rgba(0, 0, 0, 0)], [0.7, rgba(0, 0, 0, 0)], [1, rgba(0, 0, 0, 105)]]);
  ctx.restore();

  strokeCircle(ctx, cx, cy, lr, Math.max(1, r * 0.006), rgba(0, 0, 0, 150));
}

// ---- CD --------------------------------------------------------------------------------------------

function drawCd(ctx: Ctx, cx: number, cy: number, r: number, accent: string, accent2: string, visualizerFace: boolean): void {
  // Silver substrate, which also shows at the very edge of the printed area.
  radialFill(ctx, cx, cy, r, [[0, rgba(0xe9, 0xec, 0xf1)], [1, rgba(0xb6, 0xbc, 0xc6)]]);

  // Printed face between the mirror band and the rim.
  ctx.save();
  ctx.clip(ring(cx, cy, r * CD_RIM, r * CD_MIRROR_OUTER), "evenodd");
  const faceR = r * CD_RIM;
  if (visualizerFace) radialFill(ctx, cx, cy, faceR, [[0, rgba(0x16, 0x18, 0x1d)], [1, rgba(0x08, 0x09, 0x0c)]]);
  else drawFallbackFace(ctx, cx, cy, faceR, accent, accent2);

  // A subtle concentric sheen on the data area, as on real discs.
  for (let f = CD_MIRROR_OUTER + 0.04; f < CD_RIM - 0.02; f += 0.045) {
    strokeCircle(ctx, cx, cy, r * f, Math.max(0.6, r * 0.004), rgba(255, 255, 255, 14));
  }
  ctx.restore();

  // Mirror band: a brushed-metal ring around the hub.
  const bandMid = (r * (CD_HUB_OUTER + CD_MIRROR_OUTER)) / 2;
  const bandW = r * (CD_MIRROR_OUTER - CD_HUB_OUTER);
  ctx.save();
  const band = ctx.createConicGradient((-20 * Math.PI) / 180, cx, cy);
  [[0, "#f2f4f7"], [0.25, "#8e959f"], [0.5, "#e6e9ee"], [0.75, "#9aa1ab"], [1, "#f2f4f7"]].forEach(([o, c]) => band.addColorStop(o as number, c as string));
  ctx.lineWidth = bandW;
  ctx.strokeStyle = band;
  circle(ctx, cx, cy, bandMid);
  ctx.stroke();
  ctx.restore();

  // Clear plastic hub: cut it out, then lay a faint frosted tint back so it reads as glass.
  cutHole(ctx, cx, cy, r * CD_HUB_OUTER);
  ctx.fillStyle = rgba(255, 255, 255, 46);
  circle(ctx, cx, cy, r * CD_HUB_OUTER);
  ctx.fill();
  const hubEdge = rgba(255, 255, 255, 120);
  strokeCircle(ctx, cx, cy, r * CD_HUB_OUTER, Math.max(1, r * 0.006), hubEdge);
  strokeCircle(ctx, cx, cy, r * 0.215, Math.max(1, r * 0.006), hubEdge); // stacking ring

  // Spindle hole.
  const hole = r * CD_HOLE;
  cutHole(ctx, cx, cy, hole);
  strokeCircle(ctx, cx, cy, hole, Math.max(1, r * 0.007), rgba(255, 255, 255, 170));

  strokeCircle(ctx, cx, cy, r * 0.994, Math.max(1, r * 0.012), rgba(255, 255, 255, 120)); // bright outer edge
}

/** Stand-in artwork: a theme-coloured diagonal gradient (the demo has no album art). */
function drawFallbackFace(ctx: Ctx, cx: number, cy: number, radius: number, a: string, b: string): void {
  const g = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  circle(ctx, cx, cy, radius);
  ctx.fill();
}

// ---- sweep gradients -------------------------------------------------------------------------------

type Stops = Array<[number, string]>;

function sweep(ctx: Ctx, cx: number, cy: number, r: number, stops: Stops, mode: GlobalCompositeOperation): void {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  const g = ctx.createConicGradient(0, cx, cy);
  for (const [o, c] of stops) g.addColorStop(Math.min(1, Math.max(0, o)), c);
  ctx.fillStyle = g;
  circle(ctx, cx, cy, r);
  ctx.fill();
  ctx.restore();
}

/** Soft white wedges: [centre, half-width, peak alpha], all in 0..1 of a turn. */
function whiteWedges(...wedges: Array<[number, number, number]>): Stops {
  const sorted = [...wedges].sort((a, b) => a[0] - b[0]);
  const stops: Stops = [[0, rgba(255, 255, 255, 0)]];
  let last = 0;
  for (const [center, half, alpha] of sorted) {
    last = Math.max(last, center - half);
    stops.push([last, rgba(255, 255, 255, 0)]);
    stops.push([center, rgba(255, 255, 255, alpha)]);
    last = Math.min(1, center + half);
    stops.push([last, rgba(255, 255, 255, 0)]);
  }
  stops.push([1, rgba(255, 255, 255, 0)]);
  return stops;
}

/** One spectrum-coloured wedge (violet to red) centred at `center` of a turn. */
function spectralWedges(center: number, half: number, alpha: number): Stops {
  const spectrum: Array<[number, number, number, number]> = [
    [140, 80, 255, 0], [140, 80, 255, alpha], [60, 120, 255, alpha], [40, 220, 230, alpha], [80, 240, 120, alpha],
    [250, 240, 80, alpha], [255, 150, 60, alpha], [255, 70, 90, alpha], [255, 70, 90, 0],
  ];
  const stops: Stops = [[0, rgba(0, 0, 0, 0)]];
  const start = Math.max(0.0001, center - half);
  spectrum.forEach(([r, g, b, a], i) => stops.push([Math.min(0.9999, start + (half * 2 * i) / (spectrum.length - 1)), rgba(r, g, b, a)]));
  stops.push([1, rgba(0, 0, 0, 0)]);
  return stops;
}
