import { CustomVisualizerSettings, createFx, createLayer, ensureParams, FX_PARAMS, LayerSettings, paramsFor, PARAMS, setParam } from "./model";

/**
 * The four "Windows Media Player" style looks, as ordinary custom-visualizer settings. Pressing
 * Customize on one copies it into an editable visualizer.
 */

function layer(kind: LayerSettings["kind"], colorMode: LayerSettings["colorMode"], additive = true): LayerSettings {
  const l = createLayer(kind);
  l.colorMode = colorMode;
  l.additive = additive;
  return l;
}

function finish(s: CustomVisualizerSettings): CustomVisualizerSettings {
  for (const l of s.layers) ensureParams(l, paramsFor(l.kind));
  ensureParams(s.fx, FX_PARAMS);
  return s;
}

const P = PARAMS;

// Glowing spectrum columns with a ribbon of waveform over them.
function barsAndWaves(): CustomVisualizerSettings {
  const bars = layer("Bars", "Theme", false);
  [[P.count, 40], [P.size, 0.5], [P.thickness, 10], [P.amplitude, 1.2], [P.glow, 0.5], [P.opacity, 0.85]]
    .forEach(([d, v]) => setParam(bars, d as typeof P.count, v as number));
  const wave = layer("Wave", "Rainbow");
  setParam(wave, P.size, 0.3); setParam(wave, P.thickness, 3);
  setParam(wave, P.amplitude, 1.1, "Bass", 0.2); setParam(wave, P.glow, 0.7);
  const fx = createFx();
  setParam(fx, P.trails, 0.55); setParam(fx, P.hueCycle, 20);
  fx.backdrop = 0.4;
  return finish({ name: "WMP · Bars and Waves", layers: [bars, wave], fx });
}

// Slow, soft clouds of colour that breathe with the bass.
function ambience(): CustomVisualizerSettings {
  const a = layer("Blobs", "Rainbow");
  setParam(a, P.count, 7); setParam(a, P.size, 0.32, "Bass", 0.15); setParam(a, P.amplitude, 0.8);
  setParam(a, P.spin, 6); setParam(a, P.opacity, 0.55); setParam(a, P.glow, 0.3);
  const b = layer("Blobs", "Rainbow");
  setParam(b, P.count, 4); setParam(b, P.size, 0.18); setParam(b, P.hue, 160); setParam(b, P.amplitude, 1.2);
  setParam(b, P.spin, -9); setParam(b, P.opacity, 0.5); setParam(b, P.glow, 0);
  const fx = createFx();
  setParam(fx, P.trails, 0.9); setParam(fx, P.zoom, 0.02, "Bass", 0.08); setParam(fx, P.hueCycle, 14);
  fx.backdrop = 0.55;
  return finish({ name: "WMP · Ambience", layers: [a, b], fx });
}

// Spokes that flare out on every hit, throwing sparks.
function battery(): CustomVisualizerSettings {
  const spokes = layer("Radial", "Rainbow");
  setParam(spokes, P.count, 72); setParam(spokes, P.size, 0.14, "Beat", 0.1); setParam(spokes, P.thickness, 3);
  setParam(spokes, P.amplitude, 1.1); setParam(spokes, P.glow, 0.8); setParam(spokes, P.spin, 14);
  const sparks = layer("Particles", "Rainbow");
  setParam(sparks, P.count, 48); setParam(sparks, P.size, 0.08); setParam(sparks, P.thickness, 3);
  setParam(sparks, P.amplitude, 0.9); setParam(sparks, P.glow, 0.6);
  const fx = createFx();
  setParam(fx, P.trails, 0.84); setParam(fx, P.zoom, 0.04, "Beat", 0.25); setParam(fx, P.rotate, 8); setParam(fx, P.hueCycle, 30);
  fx.backdrop = 0.6;
  return finish({ name: "WMP · Battery", layers: [spokes, sparks], fx });
}

// Feedback swirl in the spirit of Geiss / Milkdrop: a scope fed back through a zoom, a twist and a six-way mirror.
function alchemy(): CustomVisualizerSettings {
  const scope = layer("Scope", "Rainbow");
  setParam(scope, P.size, 0.2, "Bass", 0.12); setParam(scope, P.thickness, 3); setParam(scope, P.amplitude, 1.3);
  setParam(scope, P.glow, 0.7); setParam(scope, P.spin, 25);
  const rings = layer("Rings", "Rainbow");
  setParam(rings, P.count, 5); setParam(rings, P.size, 0.35); setParam(rings, P.thickness, 2);
  setParam(rings, P.amplitude, 1); setParam(rings, P.glow, 0.4); setParam(rings, P.opacity, 0.7);
  const fx = createFx();
  setParam(fx, P.trails, 0.93); setParam(fx, P.zoom, 0.12, "Beat", 0.2); setParam(fx, P.rotate, 22); setParam(fx, P.hueCycle, 40);
  fx.kaleidoscope = 6;
  fx.backdrop = 0.7;
  return finish({ name: "WMP · Alchemy", layers: [scope, rings], fx });
}

export const presetSettings = (): CustomVisualizerSettings[] => [barsAndWaves(), ambience(), battery(), alchemy()];
