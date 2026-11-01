import "./style.css";
import { AudioEngine, AudioError, SourceKind } from "./audio/engine";
import { applyTheme, BUILT_IN_THEMES, randomTheme, Theme } from "./theme/theme";
import { createVisualizers } from "./viz";
import { INTERVALS_SEC, VisualizerSwitcher } from "./viz/switcher";

const VIZ_KEY = "waverider-visualizer";
const AUTO_VALUE = "auto";
const INTERVAL_KEY = "waverider-auto-interval";
const THEME_KEY = "waverider-theme";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas");
const stage = $("stage");
const overlay = $("start");
const status = $("status");
const dot = $("dot");
const supportNote = $("support-note");
const vizSelect = $<HTMLSelectElement>("visualizer");
const autoOptions = $("auto-options");
const autoInterval = $<HTMLSelectElement>("auto-interval");
const nextViz = $<HTMLButtonElement>("next-viz");
const themeSelect = $<HTMLSelectElement>("theme");
const fileInput = $<HTMLInputElement>("file");
const playPause = $<HTMLButtonElement>("playpause");
const stopButton = $<HTMLButtonElement>("stop");

const engine = new AudioEngine();
const visualizers = createVisualizers();
const switcher = new VisualizerSwitcher(visualizers);
let theme: Theme = BUILT_IN_THEMES[0];
const themes: Theme[] = [...BUILT_IN_THEMES];

// ---- storage (best effort: it can be unavailable in private windows) ----
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* not persisted */ } };

// ---- theme ----
function refreshThemeSelect(): void {
  themeSelect.replaceChildren(...themes.map((t, i) => new Option(t.name, String(i))));
  themeSelect.value = String(themes.indexOf(theme));
}

function setTheme(next: Theme): void {
  theme = next;
  if (!themes.includes(next)) themes.push(next);
  applyTheme(theme);
  refreshThemeSelect();
  write(THEME_KEY, JSON.stringify(theme));
}

try {
  const saved = JSON.parse(read(THEME_KEY) ?? "null") as Theme | null;
  if (saved?.name && saved.primary) {
    theme = BUILT_IN_THEMES.find((t) => t.name === saved.name) ?? saved;
    if (!themes.includes(theme)) themes.push(theme);
  }
} catch { /* fall back to the default theme */ }
applyTheme(theme);
refreshThemeSelect();

themeSelect.addEventListener("change", () => setTheme(themes[Number(themeSelect.value)]));
$("shuffle").addEventListener("click", () => {
  const shuffled = randomTheme();
  // Keep a single "Shuffled" entry so the list doesn't grow with every click.
  const existing = themes.findIndex((t) => t.name === "Shuffled");
  if (existing >= 0) themes.splice(existing, 1);
  setTheme(shuffled);
});

// ---- visualizer ----
// "Auto" rotates through the visualizers on a timer, like the old Windows Media Player did.
// It is the default, so a first visit shows the variety.
vizSelect.replaceChildren(
  new Option("Auto (switch automatically)", AUTO_VALUE),
  ...visualizers.map((v, i) => new Option(v.name, String(i))),
);

function syncVisualizerUi(): void {
  vizSelect.value = switcher.auto ? AUTO_VALUE : String(visualizers.indexOf(switcher.current));
  autoOptions.hidden = !switcher.auto;
  nextViz.hidden = !switcher.auto;
}

/** Shows which visualizer Auto is currently on, only touching the DOM when it changes. */
let autoLabel = "";
function updateAutoLabel(): void {
  const label = switcher.auto ? `Auto: ${switcher.current.name}` : "Auto (switch automatically)";
  if (label === autoLabel) return;
  autoLabel = label;
  vizSelect.options[0].text = label;
}

function chooseVisualizer(value: string): void {
  if (value === AUTO_VALUE) {
    switcher.enableAuto(performance.now());
    write(VIZ_KEY, AUTO_VALUE);
  } else {
    const picked = visualizers[Number(value)];
    switcher.select(picked);
    write(VIZ_KEY, picked.name);
  }
  syncVisualizerUi();
}

const savedInterval = Number(read(INTERVAL_KEY));
if (INTERVALS_SEC.includes(savedInterval)) switcher.intervalSec = savedInterval;
autoInterval.value = String(switcher.intervalSec);

const savedViz = read(VIZ_KEY);
const pinned = visualizers.find((v) => v.name === savedViz);
if (pinned) switcher.select(pinned);
else switcher.enableAuto(performance.now()); // nothing saved, or "auto"
syncVisualizerUi();

vizSelect.addEventListener("change", () => chooseVisualizer(vizSelect.value));
autoInterval.addEventListener("change", () => {
  switcher.setInterval(Number(autoInterval.value), performance.now());
  write(INTERVAL_KEY, autoInterval.value);
});
nextViz.addEventListener("click", () => switcher.advance(performance.now()));

// ---- canvas sizing ----
const ctx = canvas.getContext("2d")!;
function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
new ResizeObserver(resize).observe(canvas);
resize();

// ---- audio sources ----
const isChromium = /Chrome|Edg/.test(navigator.userAgent) && !/Mobile|Android/.test(navigator.userAgent);
const isWindows = /Windows/.test(navigator.userAgent);
if (!navigator.mediaDevices?.getDisplayMedia || !isChromium || !isWindows) {
  supportNote.hidden = false;
  supportNote.textContent =
    "Capturing system audio works in Chrome or Edge on Windows. In other browsers, use the microphone, an audio file or the demo track.";
}

function setStatus(text: string, live: boolean): void {
  status.textContent = text;
  dot.classList.toggle("live", live);
}

function showError(message: string): void {
  overlay.hidden = false;
  supportNote.hidden = false;
  supportNote.classList.add("error");
  supportNote.textContent = message;
  setStatus("Nothing playing", false);
}

function syncControls(): void {
  const active = engine.active;
  overlay.hidden = !!active;
  stopButton.hidden = !active;
  playPause.hidden = !engine.fileElement;
  document.querySelectorAll<HTMLButtonElement>(".source-switch .btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.source === active?.kind),
  );
  setStatus(active ? `Listening to ${active.label}` : "Nothing playing", !!active);
}

async function start(kind: SourceKind, file?: File): Promise<void> {
  supportNote.classList.remove("error");
  try {
    await engine.start(kind, file);
    syncControls();
  } catch (err) {
    if (err instanceof AudioError) showError(err.message);
    else showError("Something went wrong starting that source. Try another one.");
    console.error(err);
  }
}

function chooseFile(): void {
  fileInput.value = "";
  fileInput.click();
}

document.querySelectorAll<HTMLButtonElement>("[data-source]").forEach((button) => {
  button.addEventListener("click", () => {
    const kind = button.dataset.source as SourceKind;
    if (kind === "file") chooseFile();
    else void start(kind);
  });
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void start("file", file);
});

engine.onEnded = (reason) => {
  syncControls();
  showError(`${reason} Pick a source to continue.`);
};

stopButton.addEventListener("click", () => {
  engine.stop();
  syncControls();
});

playPause.addEventListener("click", () => {
  const el = engine.fileElement;
  if (!el) return;
  if (el.paused) void el.play();
  else el.pause();
  playPause.textContent = el.paused ? "Play" : "Pause";
});

$("fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void stage.requestFullscreen?.();
});

// ---- drag and drop ----
["dragenter", "dragover"].forEach((type) =>
  stage.addEventListener(type, (e) => { e.preventDefault(); stage.classList.add("dragging"); }),
);
["dragleave", "drop"].forEach((type) =>
  stage.addEventListener(type, () => stage.classList.remove("dragging")),
);
stage.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = (e as DragEvent).dataTransfer?.files?.[0];
  if (file && file.type.startsWith("audio/")) void start("file", file);
  else if (file) showError("That doesn't look like an audio file.");
});

// ---- render loop ----
// While auto mode crossfades, both visualizers draw into offscreen canvases that are blended onto the stage.
const fadeA = document.createElement("canvas");
const fadeB = document.createElement("canvas");
const fadeCtxA = fadeA.getContext("2d")!;
const fadeCtxB = fadeB.getContext("2d")!;

const t0 = performance.now();
function frame(now: number): void {
  resize();
  const w = canvas.width;
  const h = canvas.height;
  const audio = engine.frame();
  const t = (now - t0) / 1000;

  switcher.update(now);
  const outgoing = switcher.previous;
  if (outgoing) {
    for (const c of [fadeA, fadeB]) {
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }
    outgoing.render(fadeCtxA, w, h, audio, theme, t);
    switcher.current.render(fadeCtxB, w, h, audio, theme, t);
    const p = switcher.fadeProgress(now);
    // Weights that sum to 1, added together: two opaque pictures dissolve without the stage showing through
    // mid-fade (plain alpha blending would dip to 75% opacity there).
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1 - p;
    ctx.drawImage(fadeA, 0, 0);
    ctx.globalAlpha = p;
    ctx.drawImage(fadeB, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  } else {
    switcher.current.render(ctx, w, h, audio, theme, t);
  }

  updateAutoLabel();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

syncControls();
