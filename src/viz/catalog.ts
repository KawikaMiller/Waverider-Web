import { CustomVisualizer } from "./custom/customVisualizer";
import { CustomVisualizerSettings, cloneSettings, createDefaultSettings, parseSettings } from "./custom/model";
import { presetSettings } from "./custom/presets";
import { BUILT_IN_FACTORIES } from "./index";
import type { Visualizer } from "./types";

const STORAGE_KEY = "waverider-custom-visualizers";

export interface VisualizerEntry {
  readonly builtIn: boolean;
  /** Set for presets and the user's own visualizers; undefined for the hand-coded ones. */
  readonly settings?: CustomVisualizerSettings;
  readonly instance: Visualizer;
  /** A separate instance of the same visualizer, for something else drawing it at its own size (the disc). Custom ones share settings, so edits still show up live. */
  make(): Visualizer;
}

/** The list of visualizers shown in the picker: hand-coded ones, the presets, and the user's own (kept in this browser). */
export class VisualizerCatalog {
  readonly entries: VisualizerEntry[] = [];
  /** The live instances, in list order. Auto and the picker read this array directly. */
  readonly visualizers: Visualizer[] = [];
  onChange?: () => void;

  constructor() {
    for (const make of BUILT_IN_FACTORIES) this.push({ builtIn: true, instance: make(), make });
    for (const settings of presetSettings()) this.push(this.customEntry(settings, true));
    for (const settings of this.load()) this.push(this.customEntry(settings, false));
  }

  entryOf(visualizer: Visualizer): VisualizerEntry | undefined {
    return this.entries.find((e) => e.instance === visualizer);
  }

  find(name: string): Visualizer | undefined {
    return this.visualizers.find((v) => v.name === name);
  }

  /** Adds a new editable visualizer, optionally copied from a preset or another custom one. */
  create(template?: CustomVisualizerSettings): VisualizerEntry {
    const settings = template ? cloneSettings(template) : createDefaultSettings();
    settings.name = this.uniqueName(template ? `${template.name.replace(/^WMP · /, "")} (copy)` : settings.name);
    return this.add(settings);
  }

  /** Adds a visualizer read from a JSON file. Throws if the file isn't a visualizer. */
  import(json: string): VisualizerEntry {
    const settings = parseSettings(json);
    settings.name = this.uniqueName(settings.name);
    return this.add(settings);
  }

  remove(entry: VisualizerEntry): void {
    if (entry.builtIn) return;
    const i = this.entries.indexOf(entry);
    if (i < 0) return;
    this.entries.splice(i, 1);
    this.visualizers.splice(i, 1);
    this.save();
    this.onChange?.();
  }

  /** Renames a custom visualizer, keeping names unique. */
  rename(entry: VisualizerEntry, name: string): void {
    if (entry.builtIn || !entry.settings) return;
    const trimmed = name.trim().slice(0, 40) || "My Visualizer";
    entry.settings.name = this.uniqueName(trimmed, entry);
    this.save();
  }

  save(): void {
    try {
      const custom = this.entries.filter((e) => !e.builtIn && e.settings).map((e) => e.settings);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    } catch { /* storage can be unavailable; the visualizer still works for this visit */ }
  }

  private add(settings: CustomVisualizerSettings): VisualizerEntry {
    const entry = this.customEntry(settings, false);
    this.push(entry);
    this.save();
    this.onChange?.();
    return entry;
  }

  private push(entry: VisualizerEntry): void {
    this.entries.push(entry);
    this.visualizers.push(entry.instance);
  }

  private customEntry(settings: CustomVisualizerSettings, builtIn: boolean): VisualizerEntry {
    return { builtIn, settings, instance: new CustomVisualizer(settings), make: () => new CustomVisualizer(settings) };
  }

  private uniqueName(base: string, except?: VisualizerEntry): string {
    const taken = new Set(this.entries.filter((e) => e !== except).map((e) => e.instance.name.toLowerCase()));
    taken.add("auto");
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  }

  private load(): CustomVisualizerSettings[] {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (!Array.isArray(raw)) return [];
      const out: CustomVisualizerSettings[] = [];
      for (const item of raw) {
        try { out.push(parseSettings(JSON.stringify(item))); } catch { /* skip a corrupt entry */ }
      }
      return out;
    } catch {
      return [];
    }
  }
}
