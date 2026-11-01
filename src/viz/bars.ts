import { css, lerp, parseHex } from "../color";
import type { Visualizer } from "./types";

export class BarsVisualizer implements Visualizer {
  readonly name = "Bars";
  private peakHeight = new Float32Array(0);
  private peakVelocity = new Float32Array(0);
  private lastTime = 0;

  render: Visualizer["render"] = (ctx, w, h, frame, theme, t) => {
    ctx.clearRect(0, 0, w, h);
    const bands = frame.bands;
    if (bands.length === 0) return;
    if (this.peakHeight.length !== bands.length) {
      this.peakHeight = new Float32Array(bands.length);
      this.peakVelocity = new Float32Array(bands.length);
    }

    const dt = Math.min(0.05, Math.max(0, t - this.lastTime));
    this.lastTime = t;

    const midY = h * 0.62;
    const maxBarH = midY * 0.92;
    const bandW = w / bands.length;
    const pad = Math.max(1, bandW * 0.18);
    const primary = parseHex(theme.primary);
    const secondary = parseHex(theme.secondary);
    const accent = parseHex(theme.accent);
    const foreground = parseHex(theme.foreground);

    for (let i = 0; i < bands.length; i++) {
      const bh = Math.max(2, bands[i] * maxBarH);
      const x = i * bandW + pad * 0.5;
      const bw = bandW - pad;

      // Peak markers snap up instantly and fall under gravity.
      if (bh > this.peakHeight[i]) {
        this.peakHeight[i] = bh;
        this.peakVelocity[i] = 0;
      } else {
        this.peakVelocity[i] += dt * 280;
        this.peakHeight[i] = Math.max(0, this.peakHeight[i] - this.peakVelocity[i] * dt);
      }

      const color = lerp(primary, secondary, i / bands.length);

      const bar = ctx.createLinearGradient(0, midY - bh, 0, midY);
      bar.addColorStop(0, css(accent, 230 / 255));
      bar.addColorStop(1, css(color));
      ctx.fillStyle = bar;
      roundRect(ctx, x, midY - bh, bw, bh, 3);

      const mh = bh * 0.55;
      const mirror = ctx.createLinearGradient(0, midY, 0, midY + mh);
      mirror.addColorStop(0, css(color, 130 / 255));
      mirror.addColorStop(1, css(color, 0));
      ctx.fillStyle = mirror;
      roundRect(ctx, x, midY, bw, mh, 3);

      ctx.fillStyle = css(foreground, 220 / 255);
      ctx.fillRect(x, midY - this.peakHeight[i] - 2, bw, 2);
    }

    ctx.fillStyle = css(foreground, 40 / 255);
    ctx.fillRect(0, midY, w, 1);
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
