import { BUILT_IN_THEMES, Theme } from "./theme";

const STORAGE_KEY = "waverider-custom-themes";
const COLOR_KEYS = ["accent", "primary", "secondary", "background", "surface", "foreground", "muted"] as const;
const OPTIONAL_COLOR_KEYS = ["panel", "stage", "stroke"] as const;

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim());

/** Parses a theme JSON file (from this demo or the Windows app). Throws on garbage. */
export function parseTheme(json: string): Theme {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (!raw || typeof raw !== "object" || !isHex(raw.primary) || !isHex(raw.secondary)) throw new Error("Not a Waverider theme file.");

  const fallback = BUILT_IN_THEMES[0];
  const theme: Theme = {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 40) : "Imported theme",
    elementTheme: typeof raw.elementTheme === "string" && raw.elementTheme.toLowerCase() === "light" ? "Light" : "Dark",
    accent: fallback.accent, primary: fallback.primary, secondary: fallback.secondary,
    background: fallback.background, surface: fallback.surface, foreground: fallback.foreground, muted: fallback.muted,
  };
  for (const key of COLOR_KEYS) if (isHex(raw[key])) theme[key] = (raw[key] as string).trim();
  for (const key of OPTIONAL_COLOR_KEYS) if (isHex(raw[key])) theme[key] = (raw[key] as string).trim();
  return theme;
}

/** The desktop app's theme file shape: the same colours plus its Windows-only window backdrop. */
export function themeToJson(theme: Theme): string {
  return JSON.stringify({ name: theme.name, backdrop: "None", elementTheme: theme.elementTheme, ...pickColors(theme) }, null, 2);
}

function pickColors(theme: Theme): Partial<Theme> {
  const out: Partial<Theme> = {};
  for (const k of [...COLOR_KEYS, ...OPTIONAL_COLOR_KEYS]) if (theme[k]) out[k] = theme[k];
  return out;
}

/** Built-in themes plus the user's own, which live in this browser. */
export class ThemeStore {
  readonly builtIn: Theme[] = BUILT_IN_THEMES;
  custom: Theme[] = this.load();

  get all(): Theme[] {
    return [...this.builtIn, ...this.custom];
  }

  isBuiltIn(theme: Theme): boolean {
    return this.builtIn.includes(theme);
  }

  isCustom(theme: Theme): boolean {
    return this.custom.includes(theme);
  }

  /** Adds a copy of `theme` as an editable theme with a unique name. */
  add(theme: Theme, suffix = ""): Theme {
    const copy: Theme = { ...theme, name: this.uniqueName(`${theme.name}${suffix}`) };
    this.custom.push(copy);
    this.save();
    return copy;
  }

  import(json: string): Theme {
    const theme = parseTheme(json);
    theme.name = this.uniqueName(theme.name);
    this.custom.push(theme);
    this.save();
    return theme;
  }

  remove(theme: Theme): void {
    this.custom = this.custom.filter((t) => t !== theme);
    this.save();
  }

  rename(theme: Theme, name: string): void {
    theme.name = this.uniqueName(name.trim().slice(0, 40) || "My Theme", theme);
  }

  save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.custom)); } catch { /* storage unavailable */ }
  }

  private uniqueName(base: string, except?: Theme): string {
    const taken = new Set(this.all.filter((t) => t !== except).map((t) => t.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
  }

  private load(): Theme[] {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (!Array.isArray(raw)) return [];
      const out: Theme[] = [];
      for (const item of raw) {
        try { out.push(parseTheme(JSON.stringify(item))); } catch { /* skip a corrupt entry */ }
      }
      return out;
    } catch {
      return [];
    }
  }
}
