import "./style.css";
import { AudioEngine, AudioError, SourceKind } from "./audio/engine";
import { DiscView } from "./disc/view";
import type { DiscFace, DiscSkin } from "./disc/renderer";
import { ThemeStore } from "./theme/store";
import { applyTheme, randomTheme, Theme } from "./theme/theme";
import { ThemeEditor } from "./ui/themeEditor";
import { VisualizerEditor } from "./ui/visualizerEditor";
import { VisualizerCatalog, VisualizerEntry } from "./viz/catalog";
import { INTERVALS_SEC, VisualizerSwitcher } from "./viz/switcher";
import type { Visualizer } from "./viz/types";

const VIZ_KEY = "waverider-visualizer";
const AUTO_VALUE = "auto";
const INTERVAL_KEY = "waverider-auto-interval";
const THEME_KEY = "waverider-theme";
const DISC_KEY = "waverider-disc";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas");
const stage = $("stage");
const overlay = $("start");
const status = $("status");
const dot = $("dot");
const supportNote = $("support-note");
const vizSelect = $<HTMLSelectElement>("visualizer");
const themeSelect = $<HTMLSelectElement>("theme");
const autoOptions = $("auto-options");
const autoInterval = $<HTMLSelectElement>("auto-interval");
const nextViz = $<HTMLButtonElement>("next-viz");
const customizeViz = $<HTMLButtonElement>("customize-viz");
const fileInput = $<HTMLInputElement>("file");
const playPause = $<HTMLButtonElement>("playpause");
const stopButton = $<HTMLButtonElement>("stop");
const drawer = $("drawer");
const drawerBody = $("drawer-body");

const engine = new AudioEngine();
const catalog = new VisualizerCatalog();
const switcher = new VisualizerSwitcher(catalog.visualizers);
const themeStore = new ThemeStore();

// ---- storage (best effort: it can be unavailable in private windows) ----
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* not persisted */ } };

// ---- theme ----
let theme: Theme = themeStore.builtIn[0];
let tempTheme: Theme | undefined; // a shuffled palette that hasn't been saved as a custom theme

function themeList(): Theme[] {
  return tempTheme ? [...themeStore.all, tempTheme] : themeStore.all;
}

function refreshThemeSelect(): void {
  const list = themeList();
  themeSelect.replaceChildren(
    ...list.map((t, i) => new Option(t.name, String(i), false, t === theme)),
  );
  themeSelect.value = String(list.indexOf(theme));
}

function setTheme(next: Theme): void {
  theme = next;
  if (next !== tempTheme && !themeStore.all.includes(next)) tempTheme = next;
  applyTheme(theme);
  disc.setTheme(theme);
  refreshThemeSelect();
  write(THEME_KEY, JSON.stringify(theme));
}

function restoreTheme(): void {
  try {
    const saved = JSON.parse(read(THEME_KEY) ?? "null") as Theme | null;
    if (!saved?.name || !saved.primary) return;
    const known = themeStore.all.find((t) => t.name === saved.name);
    if (known) theme = known;
    else { tempTheme = saved; theme = saved; }
  } catch { /* fall back to the default theme */ }
}

themeSelect.addEventListener("change", () => setTheme(themeList()[Number(themeSelect.value)]));
$("shuffle").addEventListener("click", () => {
  tempTheme = randomTheme();
  setTheme(tempTheme);
  if (themeEditorOpen()) themeEditor.open(theme);
});

// ---- disc ----
const disc = new DiscView($("disc"));
const discSkin = $<HTMLSelectElement>("disc-skin");
const discFace = $<HTMLSelectElement>("disc-face");
const discSpin = $<HTMLInputElement>("disc-spin");
const discSpinRow = $("disc-spin-row");
let discInstanceFor: Visualizer | undefined;

function applyDiscSettings(): void {
  disc.setSkin(discSkin.value as DiscSkin);
  disc.setFace(discFace.value as DiscFace);
  disc.setVisualizerSpins(discSpin.checked);
  discSpinRow.hidden = discFace.value !== "Visualizer";
  write(DISC_KEY, JSON.stringify({ skin: discSkin.value, face: discFace.value, spin: discSpin.checked }));
}
try {
  const saved = JSON.parse(read(DISC_KEY) ?? "null") as { skin?: string; face?: string; spin?: boolean } | null;
  if (saved?.skin === "Vinyl" || saved?.skin === "Cd") discSkin.value = saved.skin;
  if (saved?.face === "Art" || saved?.face === "Visualizer") discFace.value = saved.face;
  discSpin.checked = !!saved?.spin;
} catch { /* defaults */ }
[discSkin, discFace, discSpin].forEach((c) => c.addEventListener("change", applyDiscSettings));

/** The disc draws its own copy of whatever the stage shows, so the two can run at different sizes. */
function syncDiscVisualizer(): void {
  if (discInstanceFor === switcher.current) return;
  discInstanceFor = switcher.current;
  disc.setVisualizer(catalog.entryOf(switcher.current)?.make());
}

restoreTheme();
applyTheme(theme);
disc.setTheme(theme);
applyDiscSettings();
refreshThemeSelect();

// ---- visualizer picker ----
function option(label: string, value: string): HTMLOptionElement {
  return new Option(label, value);
}

function rebuildVisualizerSelect(): void {
  const groups: Array<[string, VisualizerEntry[]]> = [
    ["Built in", catalog.entries.filter((e) => e.builtIn && !e.settings)],
    ["Windows Media Player", catalog.entries.filter((e) => e.builtIn && e.settings)],
    ["My visualizers", catalog.entries.filter((e) => !e.builtIn)],
  ];
  const children: Array<HTMLOptionElement | HTMLOptGroupElement> = [option("Auto (switch automatically)", AUTO_VALUE)];
  for (const [label, entries] of groups) {
    if (entries.length === 0) continue;
    const group = document.createElement("optgroup");
    group.label = label;
    for (const e of entries) group.append(option(e.instance.name, String(catalog.entries.indexOf(e))));
    children.push(group);
  }
  vizSelect.replaceChildren(...children);
  autoLabel = "";
  syncVisualizerUi();
}

function syncVisualizerUi(): void {
  vizSelect.value = switcher.auto ? AUTO_VALUE : String(catalog.visualizers.indexOf(switcher.current));
  autoOptions.hidden = !switcher.auto;
  nextViz.hidden = !switcher.auto;
}

/** Shows which visualizer Auto is currently on, only touching the DOM when it changes. */
let autoLabel = "";
function updateAutoLabel(): void {
  const label = switcher.auto ? `Auto: ${switcher.current.name}` : "Auto (switch automatically)";
  if (label === autoLabel) return;
  autoLabel = label;
  const first = vizSelect.options[0];
  if (first?.value === AUTO_VALUE) first.text = label;
}

function pin(visualizer: Visualizer): void {
  switcher.select(visualizer);
  write(VIZ_KEY, visualizer.name);
  syncVisualizerUi();
}

function chooseVisualizer(value: string): void {
  if (value === AUTO_VALUE) {
    switcher.enableAuto(performance.now());
    write(VIZ_KEY, AUTO_VALUE);
    syncVisualizerUi();
  } else {
    pin(catalog.visualizers[Number(value)]);
  }
  refreshCustomizeButton();
}

const savedInterval = Number(read(INTERVAL_KEY));
if (INTERVALS_SEC.includes(savedInterval)) switcher.intervalSec = savedInterval;
autoInterval.value = String(switcher.intervalSec);

const pinned = catalog.find(read(VIZ_KEY) ?? "");
if (pinned) switcher.select(pinned);
else switcher.enableAuto(performance.now()); // nothing saved, or "auto"; it's the default so a first visit shows the variety

catalog.onChange = () => { rebuildVisualizerSelect(); };
rebuildVisualizerSelect();

vizSelect.addEventListener("change", () => chooseVisualizer(vizSelect.value));
autoInterval.addEventListener("change", () => {
  switcher.setInterval(Number(autoInterval.value), performance.now());
  write(INTERVAL_KEY, autoInterval.value);
});
nextViz.addEventListener("click", () => switcher.advance(performance.now()));

// ---- editor drawer ----
type DrawerKind = "visualizer" | "theme";
let drawerKind: DrawerKind | undefined;

function openDrawer(kind: DrawerKind): void {
  drawerKind = kind;
  drawer.hidden = false;
  refreshCustomizeButton();
}

function closeDrawer(): void {
  drawerKind = undefined;
  drawer.hidden = true;
  drawerBody.replaceChildren();
  refreshCustomizeButton();
}

const themeEditorOpen = () => drawerKind === "theme";

const vizEditor = new VisualizerEditor(drawerBody, catalog, {
  select(entry) {
    pin(entry.instance);
    refreshCustomizeButton();
    vizEditor.open(entry);
    openDrawer("visualizer");
  },
  deleted() {
    closeDrawer();
    syncVisualizerUi();
  },
  renamed() {
    rebuildVisualizerSelect();
    write(VIZ_KEY, switcher.auto ? AUTO_VALUE : switcher.current.name);
  },
  close: closeDrawer,
});

const themeEditor = new ThemeEditor(drawerBody, themeStore, {
  select(next) { setTheme(next); themeEditor.open(next); openDrawer("theme"); },
  changed(t) { disc.setTheme(t); refreshThemeSelect(); write(THEME_KEY, JSON.stringify(t)); },
  deleted() { closeDrawer(); setTheme(themeStore.builtIn[0]); },
  close: closeDrawer,
});

/** Customize edits your own visualizer; on a built-in, a preset or Auto it starts an editable copy. */
function customizeVisualizer(): void {
  const entry = catalog.entryOf(switcher.current);
  if (entry && !entry.builtIn) {
    if (drawerKind === "visualizer") { closeDrawer(); return; }
    vizEditor.open(entry);
    openDrawer("visualizer");
    return;
  }
  // Copy whichever visualizer is showing (a preset keeps its look; a hand-coded one starts from the default).
  const created = catalog.create(entry?.settings);
  pin(created.instance);
  vizEditor.open(created);
  openDrawer("visualizer");
}

function customizeTheme(): void {
  if (themeStore.isCustom(theme)) {
    if (drawerKind === "theme") { closeDrawer(); return; }
    themeEditor.open(theme);
    openDrawer("theme");
    return;
  }
  // Built-in or shuffled: edit a copy, so the original is never changed.
  const copy = themeStore.add(theme, theme === tempTheme ? "" : " (copy)");
  if (theme === tempTheme) tempTheme = undefined;
  setTheme(copy);
  themeEditor.open(copy);
  openDrawer("theme");
}

function refreshCustomizeButton(): void {
  const entry = catalog.entryOf(switcher.current);
  const editing = !!entry && !entry.builtIn && drawerKind === "visualizer" && vizEditor.target === entry;
  customizeViz.textContent = editing ? "Close editor" : "Customize";
}

customizeViz.addEventListener("click", customizeVisualizer);
$("customize-theme").addEventListener("click", customizeTheme);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });

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

  syncDiscVisualizer();
  const playing = !!engine.active && !engine.fileElement?.paused;
  disc.frame(now, audio, playing, t);

  updateAutoLabel();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

syncControls();
refreshCustomizeButton();
