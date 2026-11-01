import { css, lerp, parseHex } from "../color";
import type { Visualizer } from "./types";

export class RadialVisualizer implements Visualizer {
  readonly name = "Radial";

  render: Visualizer["render"] = (ctx, w, h, frame, theme, t) => {
    ctx.clearRect(0, 0, w, h);
    const bands = frame.bands;
    if (bands.length === 0) return;

    const cx = w * 0.5;
    const cy = h * 0.5;
    const radius = Math.min(w, h) * 0.22;
    const maxLen = Math.min(w, h) * 0.28;
    const primary = parseHex(theme.primary);
    const secondary = parseHex(theme.secondary);

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.1);
    core.addColorStop(0, css(secondary, 180 / 255));
    core.addColorStop(1, css(primary, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, ((Math.PI * radius) / bands.length) * 0.8);
    const rotate = (t * 6 * Math.PI) / 180; // 6 degrees per second
    for (let i = 0; i < bands.length; i++) {
      const v = bands[i];
      const angle = (i / bands.length) * Math.PI * 2 + rotate;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      ctx.strokeStyle = css(lerp(primary, secondary, i / bands.length), (120 + 135 * v) / 255);
      ctx.beginPath();
      ctx.moveTo(cx + cos * radius, cy + sin * radius);
      ctx.lineTo(cx + cos * (radius + v * maxLen), cy + sin * (radius + v * maxLen));
      ctx.stroke();
    }
  };
}
