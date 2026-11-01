import "./style.css";
import { AudioEngine, AudioError, SourceKind } from "./audio/engine";
import { applyTheme, BUILT_IN_THEMES, randomTheme, Theme } from "./theme/theme";
import { createVisualizers } from "./viz";

const VIZ_KEY = "waverider-visualizer";
const THEME_KEY = "waverider-theme";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas");
const stage = $("stage");
const overlay = $("start");
const status = $("status");
const dot = $("dot");
const supportNote = $("support-note");
const vizSelect = $<HTMLSelectElement>("visualizer");
const themeSelect = $<HTMLSelectElement>("theme");
const fileInput = $<HTMLInputElement>("file");
const playPause = $<HTMLButtonElement>("playpause");
const stopButton = $<HTMLButtonElement>("stop");

const engine = new AudioEngine();
const visualizers = createVisualizers();
let visualizer = visualizers[0];
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
vizSelect.replaceChildren(...visualizers.map((v, i) => new Option(v.name, String(i))));
const savedViz = visualizers.find((v) => v.name === read(VIZ_KEY));
if (savedViz) visualizer = savedViz;
vizSelect.value = String(visualizers.indexOf(visualizer));
vizSelect.addEventListener("change", () => {
  visualizer = visualizers[Number(vizSelect.value)];
  write(VIZ_KEY, visualizer.name);
});

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
const t0 = performance.now();
function frame(now: number): void {
  resize();
  visualizer.render(ctx, canvas.width, canvas.height, engine.frame(), theme, (now - t0) / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

syncControls();
