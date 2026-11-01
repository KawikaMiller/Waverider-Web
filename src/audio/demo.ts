/**
 * A short synthesized loop (kick, snare, hats, bass, arpeggio, pad) so the demo has something
 * to react to without shipping any recorded music. Notes are scheduled slightly ahead of time on
 * the audio clock, so timing stays steady even when the page is busy drawing.
 */

const BPM = 118;
const STEP = 60 / BPM / 4; // a sixteenth note
const LOOKAHEAD = 0.15;

// A minor pentatonic arpeggio over a two-chord bass line.
const ARP = [57, 60, 64, 67, 69, 67, 64, 60, 55, 59, 62, 67, 71, 67, 62, 59];
const BASS = [33, 0, 33, 0, 0, 33, 0, 36, 31, 0, 31, 0, 0, 31, 0, 28];
const PAD_CHORDS = [[57, 60, 64], [55, 59, 62]];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export function startDemoTrack(ctx: AudioContext, output: AudioNode): () => void {
  const master = ctx.createGain();
  master.gain.value = 0.55;
  const compressor = ctx.createDynamicsCompressor();
  master.connect(compressor).connect(output);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

  const tone = (type: OscillatorType, freq: number, t: number, len: number, gain: number, filterHz?: number) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
    let node: AudioNode = osc;
    if (filterHz) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = filterHz;
      osc.connect(lp);
      node = lp;
    }
    node.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + len + 0.05);
  };

  const burst = (t: number, len: number, gain: number, filterType: BiquadFilterType, filterHz: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = filterHz;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(amp).connect(master);
    src.start(t);
    src.stop(t + len + 0.05);
  };

  const kick = (t: number) => {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(1, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + 0.4);
  };

  const schedule = (step: number, t: number) => {
    const s = step % 16;
    if (s % 4 === 0) kick(t);
    if (s === 4 || s === 12) {
      burst(t, 0.18, 0.5, "bandpass", 1900);
      tone("triangle", 190, t, 0.12, 0.35);
    }
    if (s % 2 === 0) burst(t, 0.05, 0.16, "highpass", 7500);
    if (s % 4 === 2) burst(t, 0.16, 0.12, "highpass", 6500);
    const bass = BASS[s];
    if (bass) tone("sawtooth", hz(bass), t, STEP * 1.6, 0.5, 320);
    tone("square", hz(ARP[s]), t, STEP * 0.9, 0.09, 2400);
    if (s === 0) {
      for (const note of PAD_CHORDS[Math.floor(step / 16) % 2]) tone("sawtooth", hz(note), t, STEP * 15, 0.06, 900);
    }
  };

  let step = 0;
  let next = ctx.currentTime + 0.1;
  const timer = window.setInterval(() => {
    while (next < ctx.currentTime + LOOKAHEAD) {
      schedule(step, next);
      step++;
      next += STEP;
    }
  }, 40);

  return () => {
    window.clearInterval(timer);
    master.disconnect();
    compressor.disconnect();
  };
}
