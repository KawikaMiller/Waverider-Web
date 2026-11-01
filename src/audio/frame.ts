/** One analysis snapshot of the audio, the same shape the desktop app's visualizers consume. */
export interface AudioFrame {
  /** Mono time-domain samples, -1..1. */
  samples: Float32Array;
  /** Linear magnitude per FFT bin. */
  spectrum: Float32Array;
  /** Log-spaced band levels, 0..1. */
  bands: Float32Array;
  rms: number;
  peak: number;
  bass: number;
  mid: number;
  treble: number;
  /** Decaying beat envelope, 0..1. */
  beat: number;
  sampleRate: number;
  timestamp: number;
}

export const BAND_COUNT = 64;

export function silentFrame(): AudioFrame {
  return {
    samples: new Float32Array(2048),
    spectrum: new Float32Array(1024),
    bands: new Float32Array(BAND_COUNT),
    rms: 0, peak: 0, bass: 0, mid: 0, treble: 0, beat: 0,
    sampleRate: 48000,
    timestamp: performance.now(),
  };
}
