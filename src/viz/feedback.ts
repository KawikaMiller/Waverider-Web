/**
 * An offscreen "previous frame" buffer for trails and feedback effects (the Milkdrop / Media Player
 * look). Each `begin` redraws the last frame faded, zoomed and rotated about the centre; the caller
 * then draws new shapes on the returned context.
 */
export class FeedbackBuffer {
  private current = FeedbackBuffer.surface();
  private previous = FeedbackBuffer.surface();
  private width = 0;
  private height = 0;

  private static surface() {
    const canvas = document.createElement("canvas");
    return { canvas, ctx: canvas.getContext("2d")! };
  }

  get canvas(): HTMLCanvasElement {
    return this.current.canvas;
  }

  /**
   * @param retain fraction of the previous frame that survives (0 = no trail)
   * @param zoom scale delta applied to the previous frame (0.02 grows it 2%)
   * @param rotateRadians rotation applied to the previous frame
   */
  begin(w: number, h: number, retain: number, zoom: number, rotateRadians: number): CanvasRenderingContext2D {
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      for (const s of [this.current, this.previous]) {
        s.canvas.width = w;
        s.canvas.height = h;
      }
      return this.current.ctx;
    }

    if (retain <= 0.01) {
      this.current.ctx.clearRect(0, 0, w, h);
      return this.current.ctx;
    }

    [this.previous, this.current] = [this.current, this.previous];
    const ctx = this.current.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(1 + zoom, 1 + zoom);
    ctx.rotate(rotateRadians);
    ctx.translate(-w / 2, -h / 2);
    ctx.globalAlpha = retain;
    ctx.drawImage(this.previous.canvas, 0, 0);
    ctx.restore();
    return ctx;
  }
}
