import {
  AUDIO_SOURCES, AudioSource, COLOR_MODES, ColorMode, createLayer, FX_PARAMS, GENERATOR_KINDS, GeneratorKind, LayerSettings,
  MAX_LAYERS, ParamDef, paramsFor, ParamValue, randomizeSettings, settingsToJson,
} from "../viz/custom/model";
import type { VisualizerCatalog, VisualizerEntry } from "../viz/catalog";
import { debounce, download, el, fileName, uid } from "./dom";

export interface EditorCallbacks {
  /** Switch the stage to this entry (after duplicate / import). */
  select(entry: VisualizerEntry): void;
  /** The entry was deleted. */
  deleted(): void;
  /** A name changed, so pickers should refresh their labels. */
  renamed(): void;
  close(): void;
}

const KALEIDOSCOPE = [1, 2, 4, 6, 8, 12];

/** The panel for editing a custom visualizer: effects, layers, and the per-parameter audio bindings. */
export class VisualizerEditor {
  private entry?: VisualizerEntry;
  private readonly persist = debounce(() => this.catalog.save(), 300);

  constructor(private readonly root: HTMLElement, private readonly catalog: VisualizerCatalog, private readonly cb: EditorCallbacks) {}

  get target(): VisualizerEntry | undefined {
    return this.entry;
  }

  open(entry: VisualizerEntry): void {
    if (entry.builtIn || !entry.settings) return;
    this.entry = entry;
    this.render();
  }

  private changed(): void {
    this.persist();
  }

  private render(): void {
    const entry = this.entry;
    const settings = entry?.settings;
    if (!entry || !settings) return;

    const nameId = uid("viz-name");
    const nameInput = el("input", { id: nameId, type: "text", value: settings.name, maxLength: 40 });
    nameInput.addEventListener("input", () => {
      this.catalog.rename(entry, nameInput.value);
      this.cb.renamed();
    });
    nameInput.addEventListener("change", () => { nameInput.value = settings.name; });

    const importInput = el("input", { type: "file", accept: ".json,application/json", hidden: true });
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        this.cb.select(this.catalog.import(await file.text()));
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "That file couldn't be imported.");
      }
    });

    const button = (label: string, onClick: () => void, title = "") => {
      const b = el("button", { type: "button", class: "btn small", title }, label);
      b.addEventListener("click", onClick);
      return b;
    };

    const header = el("div", { class: "panel-head" },
      el("h2", {}, "Visualizer editor"),
      button("✕", () => this.cb.close(), "Close"),
    );
    header.lastElementChild!.setAttribute("aria-label", "Close editor");

    const actions = el("div", { class: "panel-actions" },
      button("Randomize", () => { randomizeSettings(settings); this.changed(); this.render(); }, "Replace the layers and effects with a random combination"),
      button("Duplicate", () => this.cb.select(this.catalog.create(settings))),
      button("Export", () => download(fileName(settings.name), settingsToJson(settings)), "Save as a .json file (works in the Windows app too)"),
      button("Import", () => importInput.click(), "Load a .json visualizer file"),
      button("Delete", () => {
        if (window.confirm(`Delete "${settings.name}"?`)) {
          this.catalog.remove(entry);
          this.entry = undefined;
          this.cb.deleted();
        }
      }),
      importInput,
    );

    // Effects
    const fx = settings.fx;
    const kaleido = el("select", { id: uid("kaleido") });
    for (const n of KALEIDOSCOPE) kaleido.append(new Option(n === 1 ? "Off" : `${n} segments`, String(n), false, n === fx.kaleidoscope));
    if (!KALEIDOSCOPE.includes(fx.kaleidoscope)) kaleido.append(new Option(`${fx.kaleidoscope} segments`, String(fx.kaleidoscope), true, true));
    kaleido.addEventListener("change", () => { fx.kaleidoscope = Number(kaleido.value); this.changed(); });

    const backdrop = el("input", { type: "range", min: "0", max: "1", step: "0.01", value: String(fx.backdrop) });
    const backdropValue = el("span", { class: "val" }, fx.backdrop.toFixed(2));
    backdrop.addEventListener("input", () => { fx.backdrop = Number(backdrop.value); backdropValue.textContent = fx.backdrop.toFixed(2); this.changed(); });

    const effects = el("details", { class: "group", open: true },
      el("summary", {}, "Effects"),
      ...FX_PARAMS.map((def) => this.paramControl(fx.params, def)),
      el("label", { class: "row" }, el("span", {}, "Mirror"), kaleido),
      el("label", { class: "row" }, el("span", {}, "Background strength"), backdrop, backdropValue),
    );

    // Layers
    const layers = el("div", { class: "layers" }, ...settings.layers.map((layer, i) => this.layerCard(layer, i)));

    const addKind = el("select", { "aria-label": "Layer type" } as Partial<HTMLSelectElement>);
    for (const k of GENERATOR_KINDS) addKind.append(new Option(k, k));
    const add = button("Add layer", () => {
      if (settings.layers.length >= MAX_LAYERS) return;
      settings.layers.push(createLayer(addKind.value as GeneratorKind));
      this.changed();
      this.render();
    });
    add.disabled = settings.layers.length >= MAX_LAYERS;

    this.root.replaceChildren(
      header,
      el("label", { class: "row", for: nameId }, el("span", {}, "Name"), nameInput),
      actions,
      effects,
      el("h3", {}, `Layers (${settings.layers.length}/${MAX_LAYERS})`),
      layers,
      el("div", { class: "row add-layer" }, addKind, add),
    );
  }

  private layerCard(layer: LayerSettings, index: number): HTMLElement {
    const settings = this.entry!.settings!;

    const enabled = el("input", { type: "checkbox", checked: layer.enabled });
    enabled.addEventListener("change", () => { layer.enabled = enabled.checked; this.changed(); });

    const kind = el("select", { "aria-label": `Layer ${index + 1} type` } as Partial<HTMLSelectElement>);
    for (const k of GENERATOR_KINDS) kind.append(new Option(k, k, false, k === layer.kind));
    kind.addEventListener("change", () => {
      // Switching generator keeps the shared parameters and fills in any new ones with that generator's defaults.
      const fresh = createLayer(kind.value as GeneratorKind);
      layer.kind = fresh.kind;
      for (const def of paramsFor(layer.kind)) layer.params[def.key] ??= fresh.params[def.key];
      this.changed();
      this.render();
    });

    const remove = el("button", { type: "button", class: "btn small", title: "Remove this layer" }, "Remove");
    remove.setAttribute("aria-label", `Remove layer ${index + 1}`);
    remove.addEventListener("click", () => {
      settings.layers.splice(index, 1);
      this.changed();
      this.render();
    });

    const color = el("select", { "aria-label": `Layer ${index + 1} colors` } as Partial<HTMLSelectElement>);
    for (const m of COLOR_MODES) color.append(new Option(m === "Theme" ? "Theme colors" : m, m, false, m === layer.colorMode));
    color.addEventListener("change", () => { layer.colorMode = color.value as ColorMode; this.changed(); });

    const additive = el("input", { type: "checkbox", checked: layer.additive });
    additive.addEventListener("change", () => { layer.additive = additive.checked; this.changed(); });

    return el("section", { class: "layer" },
      el("div", { class: "layer-head" },
        el("label", { class: "check" }, enabled, el("span", {}, `${index + 1}.`)),
        kind,
        remove,
      ),
      el("label", { class: "row" }, el("span", {}, "Colors"), color),
      el("label", { class: "check" }, additive, el("span", {}, "Additive blend (bright overlap)")),
      ...paramsFor(layer.kind).map((def) => this.paramControl(layer.params, def)),
    );
  }

  /** A slider for the base value, plus an optional audio signal that moves it and how strongly. */
  private paramControl(params: Record<string, ParamValue>, def: ParamDef): HTMLElement {
    const pv = (params[def.key] ??= { value: def.def, source: "None", amount: 0.5 });
    const show = (v: number) => (def.step >= 1 ? v.toFixed(0) : v.toFixed(2));

    const value = el("span", { class: "val" }, show(pv.value));
    const slider = el("input", { type: "range", min: String(def.min), max: String(def.max), step: String(def.step), value: String(pv.value), "aria-label": def.label } as Partial<HTMLInputElement>);
    slider.addEventListener("input", () => { pv.value = Number(slider.value); value.textContent = show(pv.value); this.changed(); });

    const source = el("select", { "aria-label": `${def.label} reacts to` } as Partial<HTMLSelectElement>);
    for (const s of AUDIO_SOURCES) source.append(new Option(s === "None" ? "No audio" : `Reacts to ${s.toLowerCase()}`, s, false, s === pv.source));

    const amount = el("input", { type: "range", min: "-1", max: "1", step: "0.01", value: String(pv.amount), "aria-label": `${def.label} reaction strength` } as Partial<HTMLInputElement>);
    const amountRow = el("div", { class: "amount" }, el("span", {}, "Strength"), amount);
    amountRow.hidden = pv.source === "None";
    amount.addEventListener("input", () => { pv.amount = Number(amount.value); this.changed(); });
    source.addEventListener("change", () => {
      pv.source = source.value as AudioSource;
      amountRow.hidden = pv.source === "None";
      this.changed();
    });

    return el("div", { class: "param" },
      el("div", { class: "param-head" }, el("span", {}, def.label), value),
      slider,
      el("div", { class: "param-audio" }, source, amountRow),
    );
  }
}
