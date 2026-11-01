import type { AudioFrame } from "../audio/frame";
import type { Theme } from "../theme/theme";

export interface Visualizer {
  readonly name: string;
  /** Draws one frame onto a transparent canvas of `w` by `h` device pixels. `t` is seconds since start. */
  render(ctx: CanvasRenderingContext2D, w: number, h: number, frame: AudioFrame, theme: Theme, t: number): void;
}
