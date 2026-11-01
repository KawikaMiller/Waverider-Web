import { applyTheme, randomTheme, Theme, panelOf, stageOf, strokeOf } from "../theme/theme";
import { themeToJson, ThemeStore } from "../theme/store";
import { debounce, download, el, fileName, uid } from "./dom";

export interface ThemeEditorCallbacks {
  /** A different theme should become the current one (after a copy or import). */
  select(theme: Theme): void;
  /** A colour or the name changed on the current theme. */
  changed(theme: Theme): void;
  deleted(): void;
  close(): void;
}

const COLORS: Array<[keyof Theme, string]> = [
  ["accent", "Accent"], ["primary", "Primary"], ["secondary", "Secondary"], ["background", "Background"],
  ["surface", "Surface"], ["foreground", "Text"], ["muted", "Muted text"],
];
const DERIVED: Array<["panel" | "stage" | "stroke", string, (t: Theme) => string]> = [
  ["panel", "Panels", panelOf], ["stage", "Visualizer stage", stageOf], ["stroke", "Outlines", strokeOf],
];

/** The panel for editing a colour theme live. Built-in themes are copied first. */
export class ThemeEditor {
  private theme?: Theme;
  private readonly persist = debounce(() => this.store.save(), 300);

  constructor(private readonly root: HTMLElement, private readonly store: ThemeStore, private readonly cb: ThemeEditorCallbacks) {}

  open(theme: Theme): void {
    this.theme = theme;
    this.render();
  }

  private changed(): void {
    const theme = this.theme!;
    applyTheme(theme);
    this.cb.changed(theme);
    this.persist();
  }

  private render(): void {
    const theme = this.theme!;
    const editable = this.store.isCustom(theme);

    const button = (label: string, onClick: () => void, title = "") => {
      const b = el("button", { type: "button", class: "btn small", title }, label);
      b.addEventListener("click", onClick);
      return b;
    };

    const close = button("✕", () => this.cb.close(), "Close");
    close.setAttribute("aria-label", "Close editor");

    const nameId = uid("theme-name");
    const name = el("input", { id: nameId, type: "text", value: theme.name, maxLength: 40, disabled: !editable });
    name.addEventListener("input", () => { this.store.rename(theme, name.value); this.cb.changed(theme); this.persist(); });
    name.addEventListener("change", () => { name.value = theme.name; });

    const mode = el("select", { disabled: !editable, "aria-label": "Light or dark" } as Partial<HTMLSelectElement>);
    mode.append(new Option("Dark", "Dark", false, theme.elementTheme === "Dark"), new Option("Light", "Light", false, theme.elementTheme === "Light"));
    mode.addEventListener("change", () => { theme.elementTheme = mode.value as Theme["elementTheme"]; this.changed(); });

    const importInput = el("input", { type: "file", accept: ".json,application/json", hidden: true });
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        this.cb.select(this.store.import(await file.text()));
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "That file couldn't be imported.");
      }
    });

    const actions = el("div", { class: "panel-actions" },
      button("Randomize", () => {
        const next = randomTheme(theme.name);
        Object.assign(theme, next, { name: theme.name });
        for (const k of ["panel", "stage", "stroke"] as const) theme[k] = next[k];
        this.changed();
        this.render();
      }),
      button("Duplicate", () => this.cb.select(this.store.add(theme, " (copy)"))),
      button("Export", () => download(fileName(theme.name), themeToJson(theme)), "Save as a .json file (works in the Windows app too)"),
      button("Import", () => importInput.click(), "Load a .json theme file"),
      editable ? button("Delete", () => {
        if (window.confirm(`Delete "${theme.name}"?`)) { this.store.remove(theme); this.theme = undefined; this.cb.deleted(); }
      }) : null,
      importInput,
    );
    // Randomize rewrites the colours, so it only makes sense on a theme you can edit.
    if (!editable) (actions.firstElementChild as HTMLButtonElement).disabled = true;

    const swatch = (key: keyof Theme, label: string, auto?: (t: Theme) => string) => {
      const id = uid("color");
      const current = (theme[key] as string | undefined) ?? auto?.(theme) ?? "#000000";
      const input = el("input", { id, type: "color", value: current, disabled: !editable });
      const hex = el("code", { class: "val" }, current);
      input.addEventListener("input", () => {
        (theme[key] as string) = input.value;
        hex.textContent = input.value;
        this.changed();
      });
      return el("label", { class: "color-row", for: id }, el("span", {}, label), hex, input);
    };

    const content: Array<Node | null> = [
      el("div", { class: "panel-head" }, el("h2", {}, "Theme editor"), close),
      editable ? null : el("p", { class: "hint" }, `"${theme.name}" is built in. Duplicate it to make an editable copy.`),
      el("label", { class: "row", for: nameId }, el("span", {}, "Name"), name),
      el("label", { class: "row" }, el("span", {}, "Mode"), mode),
      actions,
      el("h3", {}, "Colors"),
      ...COLORS.map(([k, label]) => swatch(k, label)),
      el("h3", {}, "Derived colors"),
      el("p", { class: "hint" }, "Panels, stage and outlines follow the colors above unless you change them."),
      ...DERIVED.map(([k, label, auto]) => swatch(k, label, auto)),
    ];
    this.root.replaceChildren(...content.filter((c): c is Node => c !== null));
  }
}
