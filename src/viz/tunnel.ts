import { css, lerp, parseHex } from "../color";
import type { Visualizer } from "./types";

const RINGS = 28;
const SIDES = 7;

export class TunnelVisualizer implements Visualizer {
  readonly name = "Tunnel";

  render: Visualizer["render"] = (ctx, w, h, frame, theme, t) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.max(w, h) * 0.7;
    const primary = parseHex(theme.primary);
    const secondary = parseHex(theme.secondary);
    const accent = parseHex(theme.accent);
    const fg = parseHex(theme.foreground);
    const scale = Math.min(w, h) / 600;

    // Bass widens the tunnel and beats kick the rings outward.
    const pulse = frame.bass * 0.35 + frame.beat * 0.4;
    const speed = 0.18 + frame.rms * 0.6;

    const coreR = Math.min(w, h) * 0.18;
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, css(accent, 180 / 255));
    core.addColorStop(1, css(accent, 0));
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.lineJoin = "round";
    for (let i = 0; i < RINGS; i++) {
      const ringT = (i / RINGS + t * speed) % 1; // 0 at the centre, 1 at the edge
      const r = maxR * ringT * ringT * (1 + pulse);
      const rotation = t * (0.18 + i * 0.04) + i;
      const fade = Math.min(1, ringT * 4) * (1 - ringT);

      const color = i % 3 === 0 ? lerp(primary, accent, ringT) : lerp(primary, secondary, ringT);
      ctx.strokeStyle = css(color, fade * (230 / 255));
      ctx.lineWidth = ((1 - ringT) * 6 + 1) * scale;

      ctx.beginPath();
      for (let j = 0; j <= SIDES; j++) {
        const ang = (j * Math.PI * 2) / SIDES + rotation;
        const radial = r * (1 + 0.06 * Math.sin(ang * 3 + t * 2));
        const x = cx + Math.cos(ang) * radial;
        const y = cy + Math.sin(ang) * radial;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // A thin radial scan line driven by treble.
    if (frame.treble > 0.2) {
      const ang = t * 1.6;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = css(fg, (frame.treble * 80) / 255);
      ctx.lineWidth = Math.max(1, scale);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * maxR, cy + Math.sin(ang) * maxR);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
  };
}
