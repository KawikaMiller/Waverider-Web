import { lerp, parseHex } from "../color";
import type { Visualizer } from "./types";

const BUF_W = 192;
const BUF_H = 108;

/**
 * Classic demoscene plasma: four sine waves combined per pixel, mapped through the theme's colors.
 * Drawn into a small buffer and scaled up, which keeps the per-frame cost low.
 */
export class PlasmaVisualizer implements Visualizer {
  readonly name = "Plasma";
  private readonly buffer = (() => {
    const c = document.createElement("canvas");
    c.width = BUF_W;
    c.height = BUF_H;
    return c;
  })();
  private readonly image = this.buffer.getContext("2d")!.createImageData(BUF_W, BUF_H);

  render: Visualizer["render"] = (ctx, w, h, frame, theme, t) => {
    const primary = parseHex(theme.primary);
    const secondary = parseHex(theme.secondary);
    const accent = parseHex(theme.accent);
    const background = parseHex(theme.background);

    // Bass adds spatial frequency; treble adds time speed.
    const spatial = 6 + frame.bass * 6;
    const timeFactor = 1 + frame.treble * 1.3;
    const data = this.image.data;

    for (let y = 0; y < BUF_H; y++) {
      const fy = y / BUF_H - 0.5;
      for (let x = 0; x < BUF_W; x++) {
        const fx = x / BUF_W - 0.5;
        const v =
          Math.sin(fx * spatial + t * 0.7 * timeFactor) +
          Math.sin(fy * spatial + t * 1.1 * timeFactor) +
          Math.sin((fx + fy) * spatial * 0.7 + t * 0.5 * timeFactor) +
          Math.sin(Math.sqrt(fx * fx + fy * fy) * spatial * 1.6 + t * 0.9);

        const n = Math.pow((v + 4) / 8, 1.2);
        const c =
          n < 0.5 ? lerp(background, primary, n * 2)
          : n < 0.8 ? lerp(primary, accent, (n - 0.5) * 3.33)
          : lerp(accent, secondary, (n - 0.8) * 5);

        const o = (y * BUF_W + x) * 4;
        data[o] = c.r;
        data[o + 1] = c.g;
        data[o + 2] = c.b;
        data[o + 3] = 255;
      }
    }

    this.buffer.getContext("2d")!.putImageData(this.image, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.buffer, 0, 0, w, h);
  };
}
