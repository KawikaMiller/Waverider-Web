import { BarsVisualizer } from "./bars";
import { ParticleVisualizer } from "./particles";
import { PlasmaVisualizer } from "./plasma";
import { RadialVisualizer } from "./radial";
import { SpectrogramVisualizer } from "./spectrogram";
import { StarfieldVisualizer } from "./starfield";
import { TunnelVisualizer } from "./tunnel";
import type { Visualizer } from "./types";
import { WaveVisualizer } from "./wave";

export type { Visualizer } from "./types";

/** One factory per hand-coded visualizer, so anything that needs its own instance (the disc) can make one. */
export const BUILT_IN_FACTORIES: Array<() => Visualizer> = [
  () => new BarsVisualizer(),
  () => new WaveVisualizer(),
  () => new RadialVisualizer(),
  () => new SpectrogramVisualizer(),
  () => new ParticleVisualizer(),
  () => new TunnelVisualizer(),
  () => new PlasmaVisualizer(),
  () => new StarfieldVisualizer(),
];
