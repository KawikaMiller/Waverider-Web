import type { AudioFrame } from "../audio/frame";
import type { Theme } from "../theme/theme";
import type { Visualizer } from "../viz/types";
import { DiscFace, DiscSkin, drawBody, drawDiscVisualizer, drawShadow, drawSheen } from "./renderer";

const SPIN_DEGREES_PER_SECOND = 110;
const SPIN_UP_SECONDS = 0.35;
const COAST_DOWN_SECONDS = 0.9;

/** The spinning disc: four stacked canvases so only the part that should rotate does. */
export class DiscView {
  private readonly shadow = this.layer("disc-shadow");
  private readonly body = this.layer("disc-body");
  private readonly viz = this.layer("disc-viz");
  private readonly sheen = this.layer("disc-sheen");

  private skin: DiscSkin = "Vinyl";
  private face: DiscFace = "Art";
  private visualizerSpins = false;
  private theme?: Theme;
  private visualizer?: Visualizer;
  private size = 0;
  private omega = 0; // current angular speed, degrees per second
  private angle = 0;
  private lastNow = 0;
  private dirty = true;

  constructor(private readonly host: HTMLElement) {
    host.append(this.shadow.canvas, this.body.canvas, this.viz.canvas, this.sheen.canvas);
    this.applyVisualizerBlend();
  }

  setSkin(skin: DiscSkin): void {
    if (skin === this.skin) return;
    this.skin = skin;
    this.dirty = true;
    this.applyVisualizerBlend();
  }

  setFace(face: DiscFace): void {
    if (face === this.face) return;
    this.face = face;
    this.dirty = true;
    this.viz.canvas.hidden = face !== "Visualizer";
  }

  setVisualizerSpins(spins: boolean): void {
    this.visualizerSpins = spins;
    if (!spins) this.viz.canvas.style.transform = "";
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.dirty = true;
  }

  /** The disc draws its own instance, so it can run at its own size without disturbing the stage. */
  setVisualizer(visualizer: Visualizer | undefined): void {
    this.visualizer = visualizer;
  }

  get currentFace(): DiscFace {
    return this.face;
  }

  /** Call every animation frame. */
  frame(nowMs: number, audio: AudioFrame, playing: boolean, t: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(2, Math.round(this.host.clientWidth * dpr));
    if (size !== this.size) {
      this.size = size;
      for (const l of [this.shadow, this.body, this.viz, this.sheen]) l.canvas.width = l.canvas.height = size;
      this.dirty = true;
    }
    if (!this.theme) return;

    if (this.dirty) {
      drawShadow(this.shadow.ctx, size, this.skin);
      drawBody(this.body.ctx, size, this.skin, this.face, this.theme);
      drawSheen(this.sheen.ctx, size, this.skin);
      this.dirty = false;
    }

    if (this.face === "Visualizer" && this.visualizer) {
      drawDiscVisualizer(this.viz.ctx, size, this.skin, this.visualizer, audio, this.theme, t);
    }

    // Spin up quickly, coast to a stop slowly, like a platter.
    const dt = Math.min(0.1, Math.max(0, (nowMs - this.lastNow) / 1000));
    this.lastNow = nowMs;
    const target = playing ? SPIN_DEGREES_PER_SECOND : 0;
    const tau = target > this.omega ? SPIN_UP_SECONDS : COAST_DOWN_SECONDS;
    this.omega += (target - this.omega) * (1 - Math.exp(-dt / tau));
    if (!playing && this.omega < 0.4) this.omega = 0;
    this.angle = (this.angle + this.omega * dt) % 360;

    this.body.canvas.style.transform = `rotate(${this.angle}deg)`;
    if (this.visualizerSpins) this.viz.canvas.style.transform = `rotate(${this.angle}deg)`;
  }

  // On vinyl the visualizer is screened over the grooves so they show wherever it is dark; on a CD it is opaque.
  private applyVisualizerBlend(): void {
    this.viz.canvas.style.mixBlendMode = this.skin === "Vinyl" ? "screen" : "normal";
  }

  private layer(className: string) {
    const canvas = document.createElement("canvas");
    canvas.className = `disc-layer ${className}`;
    canvas.hidden = className === "disc-viz";
    return { canvas, ctx: canvas.getContext("2d")! };
  }
}
