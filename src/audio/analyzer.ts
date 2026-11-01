import { AudioFrame, BAND_COUNT } from "./frame";

const FFT_SIZE = 2048;
const SMOOTHING = 0.55;

/**
 * Turns whatever is connected to `input` into AudioFrames: log-spaced bands from 30 Hz to Nyquist
 * (smoothed), bass / mid / treble averages, and an energy-based beat envelope. A port of the
 * desktop app's FftAnalyzer, with the browser's AnalyserNode doing the FFT.
 */
export class Analyzer {
  readonly input: AnalyserNode;
  private readonly time = new Float32Array(FFT_SIZE);
  private readonly db: Float32Array<ArrayBuffer>;
  private readonly smoothed = new Float32Array(BAND_COUNT);
  private readonly bassHistory = new Float32Array(60);
  private bassIndex = 0;
  private beatEnvelope = 0;
  private lastBeatMs = 0;

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createAnalyser();
    this.input.fftSize = FFT_SIZE;
    this.input.smoothingTimeConstant = 0; // smoothing happens on the bands, as in the app
    this.db = new Float32Array(this.input.frequencyBinCount);
  }

  analyze(): AudioFrame {
    this.input.getFloatTimeDomainData(this.time);
    this.input.getFloatFrequencyData(this.db);

    const sampleRate = this.ctx.sampleRate;
    const samples = Float32Array.from(this.time);

    let peak = 0, sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / samples.length);

    const spectrum = new Float32Array(this.db.length);
    for (let i = 0; i < spectrum.length; i++) spectrum[i] = Math.pow(10, this.db[i] / 20);

    const bands = this.computeBands(sampleRate);
    for (let i = 0; i < BAND_COUNT; i++) {
      this.smoothed[i] = this.smoothed[i] * SMOOTHING + bands[i] * (1 - SMOOTHING);
      bands[i] = this.smoothed[i];
    }

    const bassEnd = Math.max(2, Math.floor(BAND_COUNT / 6));
    const midEnd = Math.max(bassEnd + 1, Math.floor((BAND_COUNT * 4) / 6));
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < bassEnd; i++) bass += bands[i];
    for (let i = bassEnd; i < midEnd; i++) mid += bands[i];
    for (let i = midEnd; i < BAND_COUNT; i++) treble += bands[i];
    bass /= bassEnd;
    mid /= midEnd - bassEnd;
    treble /= BAND_COUNT - midEnd;

    // A beat is bass above 1.4x its rolling average, with at least 180 ms between beats.
    this.bassHistory[this.bassIndex] = bass;
    this.bassIndex = (this.bassIndex + 1) % this.bassHistory.length;
    let avg = 0;
    for (let i = 0; i < this.bassHistory.length; i++) avg += this.bassHistory[i];
    avg /= this.bassHistory.length;

    const now = performance.now();
    if (bass > avg * 1.4 && bass > 0.32 && now - this.lastBeatMs > 180) {
      this.beatEnvelope = 1;
      this.lastBeatMs = now;
    }
    this.beatEnvelope = Math.max(0, this.beatEnvelope - 0.06);

    return { samples, spectrum, bands, rms, peak, bass, mid, treble, beat: this.beatEnvelope, sampleRate, timestamp: now };
  }

  private computeBands(sampleRate: number): Float32Array {
    const minHz = 30;
    const maxHz = sampleRate * 0.5;
    const logMin = Math.log(minHz);
    const step = (Math.log(maxHz) - logMin) / BAND_COUNT;
    const binHz = sampleRate / FFT_SIZE;
    const bands = new Float32Array(BAND_COUNT);

    for (let b = 0; b < BAND_COUNT; b++) {
      const fLo = Math.exp(logMin + step * b);
      const fHi = Math.exp(logMin + step * (b + 1));
      const loBin = Math.max(1, Math.floor(fLo / binHz));
      let hiBin = Math.min(this.db.length - 1, Math.ceil(fHi / binHz));
      if (hiBin < loBin) hiBin = loBin;

      let maxDb = -120;
      for (let i = loBin; i <= hiBin; i++) if (this.db[i] > maxDb) maxDb = this.db[i];
      bands[b] = Math.min(1, Math.max(0, (maxDb + 80) / 80));
    }
    return bands;
  }
}
