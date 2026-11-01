import { css, lerp, parseHex } from "../color";
import type { Visualizer } from "./types";

interface Star { x: number; y: number; z: number; prevX: number; prevY: number }

const STAR_COUNT = 450;

const randomStar = (z: number): Star => ({
  x: (Math.random() * 2 - 1) * 2,
  y: (Math.random() * 2 - 1) * 2,
  z,
  prevX: 0,
  prevY: 0,
});

export class StarfieldVisualizer implements Visualizer {
  readonly name = "Starfield";
  private readonly stars: Star[] = Array.from({ length: STAR_COUNT }, () => randomStar(Math.random() * 0.95 + 0.05));
  private lastTime = 0;

  render: Visualizer["render"] = (ctx, w, h, frame, theme, t) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const dt = Math.min(0.05, Math.max(0.001, t - this.lastTime));
    this.lastTime = t;
    const scale = Math.min(w, h) / 600;

    // Warp speed grows with overall energy and spikes on beats.
    const speed = 0.4 + frame.rms * 9 + frame.beat * 2.5;
    const primary = parseHex(theme.primary);
    const secondary = parseHex(theme.secondary);
    const accent = parseHex(theme.accent);

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const s of this.stars) {
      s.prevX = (s.x / s.z) * cx + cx;
      s.prevY = (s.y / s.z) * cy + cy;
      s.z -= speed * dt * 0.6;

      const px = (s.x / s.z) * cx + cx;
      const py = (s.y / s.z) * cy + cy;
      if (s.z <= 0.02 || px < -20 || px > w + 20 || py < -20 || py > h + 20) {
        Object.assign(s, randomStar(1));
        s.prevX = (s.x / s.z) * cx + cx;
        s.prevY = (s.y / s.z) * cy + cy;
        continue;
      }

      const brightness = Math.min(1, (1 - s.z) * 1.2);
      const color = brightness < 0.5 ? lerp(secondary, primary, brightness * 2) : lerp(primary, accent, (brightness - 0.5) * 2);
      ctx.strokeStyle = css(color, brightness);
      ctx.lineWidth = (brightness * 3 + 0.4) * scale;
      ctx.beginPath();
      ctx.moveTo(s.prevX, s.prevY);
      ctx.lineTo(px, py);
      ctx.stroke();
    }

    // The centre "warp" glow pulses with the bass.
    const glowR = Math.min(w, h) * 0.18 * (1 + frame.bass * 0.5);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    glow.addColorStop(0, css(accent, (80 + frame.beat * 120) / 255));
    glow.addColorStop(1, css(accent, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  };
}
