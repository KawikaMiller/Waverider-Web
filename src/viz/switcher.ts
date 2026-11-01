import type { Visualizer } from "./types";

export const FADE_MS = 900;

/** How long Auto stays on one visualizer: long enough to enjoy it, like the old Media Player. */
export const INTERVALS_SEC = [120, 180, 300, 600];
export const DEFAULT_INTERVAL_SEC = 180;

/**
 * Chooses which visualizer to draw. In auto mode it moves to a different one every `intervalSec`
 * seconds, working through a shuffled bag so every visualizer is shown before any repeats, and
 * reports a crossfade progress while the old and new ones overlap.
 */
export class VisualizerSwitcher {
  auto = false;
  intervalSec = DEFAULT_INTERVAL_SEC;
  current: Visualizer;
  previous?: Visualizer;

  private fadeStart = 0;
  private nextAt = 0;
  private bag: Visualizer[] = [];

  constructor(private readonly all: Visualizer[], initial: Visualizer = all[0]) {
    this.current = initial;
  }

  /** Pins one visualizer and turns auto mode off. */
  select(visualizer: Visualizer): void {
    this.auto = false;
    this.current = visualizer;
    this.previous = undefined;
  }

  enableAuto(now: number): void {
    this.auto = true;
    this.nextAt = now + this.intervalSec * 1000;
  }

  setInterval(seconds: number, now: number): void {
    this.intervalSec = seconds;
    if (this.auto) this.nextAt = now + seconds * 1000;
  }

  /** Moves to the next visualizer in the bag, restarting the timer and the crossfade. */
  advance(now: number): void {
    if (this.all.length < 2) return;
    if (this.bag.length === 0) this.bag = shuffled(this.all.filter((v) => v !== this.current));
    this.previous = this.current;
    this.current = this.bag.pop()!;
    this.fadeStart = now;
    this.nextAt = now + this.intervalSec * 1000;
  }

  /** Call once per frame. */
  update(now: number): void {
    if (this.auto && now >= this.nextAt) this.advance(now);
    if (this.previous && now - this.fadeStart >= FADE_MS) this.previous = undefined;
  }

  /** 0..1 progress of the crossfade; 1 when no fade is running. */
  fadeProgress(now: number): number {
    return this.previous ? Math.min(1, (now - this.fadeStart) / FADE_MS) : 1;
  }
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
