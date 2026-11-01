import type { AudioFrame } from "../../audio/frame";

export type AudioSource = "None" | "Bass" | "Mid" | "Treble" | "Beat" | "Loudness";
export type GeneratorKind = "Bars" | "Wave" | "Radial" | "Rings" | "Scope" | "Particles" | "Blobs";
export type ColorMode = "Theme" | "Rainbow" | "Solid";

export const AUDIO_SOURCES: AudioSource[] = ["None", "Bass", "Mid", "Treble", "Beat", "Loudness"];
export const GENERATOR_KINDS: GeneratorKind[] = ["Bars", "Wave", "Radial", "Rings", "Scope", "Particles", "Blobs"];
export const COLOR_MODES: ColorMode[] = ["Theme", "Rainbow", "Solid"];
export const MAX_LAYERS = 8;

/** One tweakable parameter: its range and the slider step in the editor. */
export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  def: number;
  step: number;
}

const p = (key: string, label: string, min: number, max: number, def: number, step: number): ParamDef => ({ key, label, min, max, def, step });

export const PARAMS = {
  count: p("count", "Count", 3, 96, 32, 1),
  size: p("size", "Size", 0.05, 1, 0.5, 0.01),
  thickness: p("thickness", "Thickness", 1, 24, 4, 0.5),
  amplitude: p("amplitude", "Amplitude", 0, 3, 1, 0.05),
  spin: p("spin", "Spin (°/s)", -180, 180, 0, 1),
  glow: p("glow", "Glow", 0, 1, 0.4, 0.01),
  opacity: p("opacity", "Opacity", 0.05, 1, 0.9, 0.01),
  hue: p("hue", "Hue", 0, 360, 0, 1),
  trails: p("trails", "Trails", 0, 0.98, 0.8, 0.01),
  zoom: p("zoom", "Zoom (per sec)", -0.6, 0.6, 0, 0.01),
  rotate: p("rotate", "Rotate (°/s)", -90, 90, 0, 1),
  hueCycle: p("hueCycle", "Hue cycle (°/s)", 0, 180, 15, 1),
} satisfies Record<string, ParamDef>;

export const FX_PARAMS: ParamDef[] = [PARAMS.trails, PARAMS.zoom, PARAMS.rotate, PARAMS.hueCycle];

const ALL_PARAMS = new Map<string, ParamDef>(Object.values(PARAMS).map((d) => [d.key, d]));
export const paramDef = (key: string): ParamDef => ALL_PARAMS.get(key)!;

/** The parameters a generator actually reads, in editor order. */
export function paramsFor(kind: GeneratorKind): ParamDef[] {
  const { count, size, thickness, amplitude, spin, glow, opacity, hue } = PARAMS;
  switch (kind) {
    case "Bars": return [count, size, thickness, amplitude, glow, opacity, hue, spin];
    case "Wave": return [size, thickness, amplitude, glow, opacity, hue, spin];
    case "Radial": return [count, size, thickness, amplitude, glow, opacity, hue, spin];
    case "Rings": return [count, size, thickness, amplitude, glow, opacity, hue, spin];
    case "Scope": return [size, thickness, amplitude, glow, opacity, hue, spin];
    case "Particles": return [count, size, thickness, amplitude, glow, opacity, hue];
    case "Blobs": return [count, size, amplitude, glow, opacity, hue, spin];
  }
}

/** A parameter's base value, plus an optional audio signal that modulates it. */
export interface ParamValue {
  value: number;
  source: AudioSource;
  /** -1..1, as a fraction of the parameter's full range. */
  amount: number;
}

export interface LayerSettings {
  kind: GeneratorKind;
  enabled: boolean;
  colorMode: ColorMode;
  additive: boolean;
  params: Record<string, ParamValue>;
}

export interface FxSettings {
  params: Record<string, ParamValue>;
  /** Mirror segments: 1 is off, otherwise 2, 4, 6, 8 ... */
  kaleidoscope: number;
  /** 0..1: how strongly the theme background is painted behind the effect. */
  backdrop: number;
}

export interface CustomVisualizerSettings {
  name: string;
  layers: LayerSettings[];
  fx: FxSettings;
}

export function audioLevel(frame: AudioFrame, source: AudioSource): number {
  switch (source) {
    case "Bass": return frame.bass;
    case "Mid": return frame.mid;
    case "Treble": return frame.treble;
    case "Beat": return frame.beat;
    case "Loudness": return Math.min(1, Math.max(0, frame.rms * 4));
    default: return 0;
  }
}

export function evalParam(params: Record<string, ParamValue>, key: string, frame: AudioFrame): number {
  const def = paramDef(key);
  const pv = params[key];
  if (!pv) return def.def;
  let v = pv.value;
  if (pv.source !== "None") v += audioLevel(frame, pv.source) * pv.amount * (def.max - def.min);
  return Math.min(def.max, Math.max(def.min, v));
}

const value = (v: number, source: AudioSource = "None", amount = 0.5): ParamValue => ({ value: v, source, amount });

/** Fluent setter for presets: sets a base value plus an optional audio binding. */
export function setParam<T extends { params: Record<string, ParamValue> }>(
  target: T, def: ParamDef, v: number, source: AudioSource = "None", amount = 0.5,
): T {
  target.params[def.key] = value(v, source, amount);
  return target;
}

export function ensureParams(target: { params: Record<string, ParamValue> }, defs: ParamDef[]): void {
  for (const d of defs) target.params[d.key] ??= value(d.def);
}

export function createLayer(kind: GeneratorKind): LayerSettings {
  const layer: LayerSettings = { kind, enabled: true, colorMode: "Theme", additive: true, params: {} };
  ensureParams(layer, paramsFor(kind));
  const { count, size, thickness, amplitude, spin, opacity } = PARAMS;
  switch (kind) {
    case "Bars": setParam(setParam(setParam(layer, count, 48), size, 0.45), thickness, 6); break;
    case "Wave": setParam(setParam(layer, size, 0.3), thickness, 3); break;
    case "Radial": setParam(setParam(setParam(layer, count, 64), size, 0.25), thickness, 3); break;
    case "Rings": setParam(setParam(setParam(layer, count, 8), size, 0.6), thickness, 3); break;
    case "Scope": setParam(setParam(layer, size, 0.25), thickness, 3); break;
    case "Particles": setParam(setParam(setParam(setParam(layer, count, 32), size, 0.1), thickness, 3), amplitude, 0.8); break;
    case "Blobs": setParam(setParam(setParam(setParam(layer, count, 6), size, 0.3), spin, 8), opacity, 0.55); break;
  }
  return layer;
}

export function createFx(): FxSettings {
  const fx: FxSettings = { params: {}, kaleidoscope: 1, backdrop: 0.35 };
  ensureParams(fx, FX_PARAMS);
  return fx;
}

export function createDefaultSettings(): CustomVisualizerSettings {
  const wave = setParam(createLayer("Wave"), PARAMS.amplitude, 1.2, "Bass", 0.2);
  const rings = setParam(createLayer("Rings"), PARAMS.size, 0.55, "Beat", 0.12);
  wave.colorMode = rings.colorMode = "Rainbow";
  const fx = createFx();
  setParam(setParam(fx, PARAMS.trails, 0.82), PARAMS.hueCycle, 20);
  return { name: "My Visualizer", layers: [wave, rings], fx };
}

export const cloneSettings = (s: CustomVisualizerSettings): CustomVisualizerSettings => JSON.parse(JSON.stringify(s));

// ---- JSON: the same shape the desktop app reads and writes ----------------------------------------

const asEnum = <T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.find((a) => typeof raw === "string" && a.toLowerCase() === raw.toLowerCase()) ?? fallback;

const asNumber = (raw: unknown, fallback: number): number => (typeof raw === "number" && Number.isFinite(raw) ? raw : fallback);

function readParams(raw: unknown, defs: ParamDef[]): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown>>;
  for (const d of defs) {
    const r = src[d.key];
    out[d.key] = r && typeof r === "object"
      ? {
          value: Math.min(d.max, Math.max(d.min, asNumber(r.value, d.def))),
          source: asEnum(r.source, AUDIO_SOURCES, "None"),
          amount: Math.min(1, Math.max(-1, asNumber(r.amount, 0.5))),
        }
      : value(d.def);
  }
  return out;
}

/** Parses and sanitizes a visualizer JSON file (from this demo or the Windows app). Throws on garbage. */
export function parseSettings(json: string): CustomVisualizerSettings {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.layers)) throw new Error("Not a Waverider visualizer file.");

  const layers: LayerSettings[] = raw.layers.slice(0, MAX_LAYERS).map((l: Record<string, unknown>) => {
    const kind = asEnum(l.kind, GENERATOR_KINDS, "Bars");
    return {
      kind,
      enabled: l.enabled !== false,
      colorMode: asEnum(l.colorMode, COLOR_MODES, "Theme"),
      additive: l.additive !== false,
      params: readParams(l.params, paramsFor(kind)),
    };
  });

  const fxRaw = (raw.fx && typeof raw.fx === "object" ? raw.fx : {}) as Record<string, unknown>;
  const fx: FxSettings = {
    params: readParams(fxRaw.params, FX_PARAMS),
    kaleidoscope: Math.min(16, Math.max(1, Math.round(asNumber(fxRaw.kaleidoscope, 1)))),
    backdrop: Math.min(1, Math.max(0, asNumber(fxRaw.backdrop, 0.35))),
  };
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 40) : "Imported visualizer";
  return { name, layers, fx };
}

export const settingsToJson = (s: CustomVisualizerSettings): string => JSON.stringify(s, null, 2);

// ---- randomize ------------------------------------------------------------------------------------

/** Replaces the layers and effects with a random but sensible combination. */
export function randomizeSettings(s: CustomVisualizerSettings): void {
  const rnd = Math.random;
  s.layers = [];
  const count = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < count; i++) {
    const layer = createLayer(GENERATOR_KINDS[Math.floor(rnd() * GENERATOR_KINDS.length)]);
    layer.colorMode = COLOR_MODES[Math.floor(rnd() * 3)];
    layer.additive = rnd() < 0.7;
    for (const def of paramsFor(layer.kind)) {
      if (def.key === "opacity") { setParam(layer, def, 0.6 + rnd() * 0.4); continue; }
      let v = def.min + (def.max - def.min) * (0.15 + rnd() * 0.6);
      if (def.key === "size") v = 0.15 + rnd() * 0.55;
      if (def.key === "spin") v = rnd() < 0.5 ? 0 : (rnd() - 0.5) * 120;
      if (def.key === "hue") v = rnd() * 360;
      let source: AudioSource = "None";
      let amount = 0.5;
      const bindable = ["size", "amplitude", "thickness", "glow", "count"].includes(def.key);
      if (bindable && rnd() < 0.45) {
        source = AUDIO_SOURCES[1 + Math.floor(rnd() * 5)];
        amount = 0.15 + rnd() * 0.35;
      }
      setParam(layer, def, v, source, amount);
    }
    s.layers.push(layer);
  }

  s.fx.params = {};
  setParam(s.fx, PARAMS.trails, 0.5 + rnd() * 0.42);
  setParam(s.fx, PARAMS.zoom, rnd() < 0.5 ? 0 : (rnd() - 0.5) * 0.3, rnd() < 0.4 ? "Beat" : "None", 0.1);
  setParam(s.fx, PARAMS.rotate, rnd() < 0.5 ? 0 : (rnd() - 0.5) * 60);
  setParam(s.fx, PARAMS.hueCycle, rnd() * 60);
  ensureParams(s.fx, FX_PARAMS);
  const segments = [1, 1, 2, 4, 6, 8];
  s.fx.kaleidoscope = segments[Math.floor(rnd() * segments.length)];
  s.fx.backdrop = 0.3 + rnd() * 0.4;
}
