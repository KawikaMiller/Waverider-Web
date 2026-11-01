import { css, parseHex } from "../color";
import type { Visualizer } from "./types";

const LAYERS = 4;

export class WaveVisualizer implements Visualizer {
  readonly name = "Waveform";

  render: Visualizer["render"] = (ctx, w, h, frame, theme) => {
    ctx.clearRect(0, 0, w, h);
    const samples = frame.samples;
    if (samples.length === 0) return;

    const primary = parseHex(theme.primary);
    const secondary = parseHex(theme.secondary);
    const accent = parseHex(theme.accent);
    const midY = h * 0.5;
    const amp = (1.4 + frame.bass * 0.8) * h * 0.4;
    const stride = Math.max(1, Math.floor(w / 1200));

    // Four phase-shifted layers, fading out: the deepest is wide, soft and glowing,
    // the top one is the crisp current waveform.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let layer = LAYERS - 1; layer >= 0; layer--) {
      const t = layer / LAYERS;
      const phaseShift = layer * 0.07;
      const yOffset = (layer - (LAYERS - 1) * 0.5) * 6;
      const alpha = 1 - t * 0.7;

      ctx.beginPath();
      for (let x = 0; x < w; x += stride) {
        let idx = Math.floor((x / w + phaseShift) * (samples.length - 1)) % samples.length;
        if (idx < 0) idx += samples.length;
        const y = midY + yOffset + samples[idx] * amp * (1 - t * 0.25);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, css(primary, alpha));
      grad.addColorStop(0.5, css(accent, alpha));
      grad.addColorStop(1, css(secondary, alpha));
      ctx.strokeStyle = grad;

      const strokeWidth = 4.5 - layer * 0.85;
      if (layer === LAYERS - 1) {
        ctx.filter = "blur(8px)";
        ctx.lineWidth = strokeWidth * 2;
      } else {
        ctx.filter = "none";
        ctx.lineWidth = strokeWidth;
      }
      ctx.stroke();
    }
    ctx.filter = "none";
  };
}
