import type { Theme } from "../../theme/theme";
import { css, parseHex } from "../../color";
import { FeedbackBuffer } from "../feedback";
import type { Visualizer } from "../types";
import { drawLayer, GlowSurface } from "./layers";
import { CustomVisualizerSettings, evalParam } from "./model";

/**
 * A visualizer assembled from settings: a stack of generator layers drawn into a feedback buffer
 * (trails / zoom / rotate), then presented through an optional kaleidoscope. Settings are read every
 * frame, so edits show up live.
 */
export class CustomVisualizer implements Visualizer {
  private readonly buffer = new FeedbackBuffer();
  private readonly glow = new GlowSurface();
  private lastTime = 0;
  private hueShift = 0;

  constructor(readonly settings: CustomVisualizerSettings) {}

  get name(): string {
    return this.settings.name;
  }

  render: Visualizer["render"] = (ctx, w, h, frame, theme: Theme, t) => {
    ctx.clearRect(0, 0, w, h);
    if (w <= 0 || h <= 0) return;

    const dt = Math.min(0.05, Math.max(0, t - this.lastTime));
    this.lastTime = t;

    const fx = this.settings.fx;
    const retain = Math.min(0.99, Math.max(0, evalParam(fx.params, "trails", frame)));
    const zoom = evalParam(fx.params, "zoom", frame);
    const rotate = evalParam(fx.params, "rotate", frame);
    this.hueShift = (this.hueShift + evalParam(fx.params, "hueCycle", frame) * dt) % 360;

    // Trail decay is expressed per 1/60 s so it looks the same at any frame rate.
    const buf = this.buffer.begin(w, h, Math.pow(retain, dt * 60), zoom * dt, (rotate * dt * Math.PI) / 180);

    for (const layer of this.settings.layers) {
      if (layer.enabled) drawLayer({ ctx: buf, w, h, frame, theme, time: t, dt, hueShift: this.hueShift, glow: this.glow }, layer);
    }

    if (fx.backdrop > 0.01) {
      ctx.fillStyle = css(parseHex(theme.background), Math.min(1, Math.max(0, fx.backdrop)));
      ctx.fillRect(0, 0, w, h);
    }

    drawKaleidoscope(ctx, this.buffer.canvas, w, h, Math.min(16, Math.max(1, Math.trunc(fx.kaleidoscope))));
  };
}

/** Mirrored wedges around the centre: even wedges are rotated copies, odd ones are flipped so neighbours meet seamlessly. */
function drawKaleidoscope(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement, w: number, h: number, segments: number): void {
  if (segments <= 1) {
    ctx.drawImage(image, 0, 0);
    return;
  }
  const cx = w / 2, cy = h / 2;
  const reach = Math.hypot(cx, cy) + 4;
  const step = (Math.PI * 2) / segments;

  const wedge = new Path2D();
  wedge.moveTo(cx, cy);
  const arc = 12;
  for (let i = 0; i <= arc; i++) {
    const a = (step * i) / arc;
    wedge.lineTo(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach);
  }
  wedge.closePath();

  for (let k = 0; k < segments; k++) {
    ctx.save();
    ctx.translate(cx, cy);
    if (k % 2 === 0) {
      ctx.rotate(k * step);
    } else {
      ctx.rotate((k + 1) * step);
      ctx.scale(1, -1);
    }
    ctx.translate(-cx, -cy);
    ctx.clip(wedge);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }
}
