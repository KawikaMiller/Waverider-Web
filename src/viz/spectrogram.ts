import { lerp, parseHex } from "../color";
import type { Visualizer } from "./types";

/** A scrolling heat map: one pixel column per frame, newest on the right, high frequencies on top. */
export class SpectrogramVisualizer implements Visualizer {
  readonly name = "Spectrogram";
  private buffer?: HTMLCanvasElement;
  private bufferCtx?: CanvasRenderingContext2D;
  private writeColumn = 0;

  render: Visualizer["render"] = (ctx, w, h, frame, theme) => {
    const bands = frame.bands;
    if (w <= 0 || h <= 0 || bands.length === 0) return;

    if (!this.buffer || this.buffer.width !== w || this.buffer.height !== bands.length) {
      this.buffer = document.createElement("canvas");
      this.buffer.width = w;
      this.buffer.height = bands.length;
      this.bufferCtx = this.buffer.getContext("2d", { willReadFrequently: false })!;
      this.writeColumn = 0;
    }

    const primary = parseHex(theme.primary);
    const secondary = parseHex(theme.secondary);
    const clear = { r: 0, g: 0, b: 0, a: 0 };
    const column = this.bufferCtx!.createImageData(1, bands.length);
    for (let i = 0; i < bands.length; i++) {
      const v = bands[bands.length - 1 - i];
      const c = lerp(clear, lerp(primary, secondary, v), Math.pow(v, 0.6));
      column.data[i * 4] = c.r;
      column.data[i * 4 + 1] = c.g;
      column.data[i * 4 + 2] = c.b;
      column.data[i * 4 + 3] = c.a * 255;
    }
    this.bufferCtx!.putImageData(column, this.writeColumn, 0);
    this.writeColumn = (this.writeColumn + 1) % w;

    ctx.clearRect(0, 0, w, h);
    // Two pieces, so the newest column sits at the right edge.
    ctx.drawImage(this.buffer, this.writeColumn, 0, w - this.writeColumn, bands.length, 0, 0, w - this.writeColumn, h);
    if (this.writeColumn > 0) {
      ctx.drawImage(this.buffer, 0, 0, this.writeColumn, bands.length, w - this.writeColumn, 0, this.writeColumn, h);
    }
  };
}
