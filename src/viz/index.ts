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

export function createVisualizers(): Visualizer[] {
  return [
    new BarsVisualizer(),
    new WaveVisualizer(),
    new RadialVisualizer(),
    new SpectrogramVisualizer(),
    new ParticleVisualizer(),
    new TunnelVisualizer(),
    new PlasmaVisualizer(),
    new StarfieldVisualizer(),
  ];
}
