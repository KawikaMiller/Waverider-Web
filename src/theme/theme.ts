import { hsv, mixHex, parseHex, toHex } from "../color";

/** Same fields as the desktop app's theme JSON (minus the Windows-only backdrop). */
export interface Theme {
  name: string;
  elementTheme: "Dark" | "Light";
  accent: string;
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  panel?: string;
  stage?: string;
  stroke?: string;
}

export const BUILT_IN_THEMES: Theme[] = [
  {
    name: "Spotify", elementTheme: "Dark",
    accent: "#1DB954", primary: "#1DB954", secondary: "#1ED760",
    background: "#0A0A0A", surface: "#181818", foreground: "#FFFFFF", muted: "#B3B3B3",
  },
  {
    name: "Synthwave", elementTheme: "Dark",
    accent: "#FF2A6D", primary: "#FF2A6D", secondary: "#05D9E8",
    background: "#1A0033", surface: "#2D0052", foreground: "#F5E1FF", muted: "#A085C2",
  },
  {
    name: "Solar Flare", elementTheme: "Dark",
    accent: "#FFB347", primary: "#FF6B35", secondary: "#FFC857",
    background: "#1A0F00", surface: "#2A1A05", foreground: "#FFE6CC", muted: "#B89472",
  },
  {
    name: "Soft Light", elementTheme: "Light",
    accent: "#148A3B", primary: "#1DB954", secondary: "#7ED9A0",
    background: "#CDD1C9", surface: "#E8EBE4", foreground: "#1B211C", muted: "#566057",
    panel: "#E8EBE4", stage: "#0F1913", stroke: "#AEB5A9",
  },
];

export const panelOf = (t: Theme) => t.panel ?? t.surface;
export const stageOf = (t: Theme) => t.stage ?? mixHex(t.background, "#000000", 0.45);
export const strokeOf = (t: Theme) => t.stroke ?? mixHex(panelOf(t), t.foreground, 0.18);

/** Builds a coherent random palette: one hue, a second analogous or near-complementary hue. */
export function randomTheme(name = "Shuffled"): Theme {
  const rand = () => Math.random();
  const range = (min: number, span: number) => min + rand() * span;
  const hex = (h: number, s: number, v: number) => toHex(hsv(h, Math.min(100, Math.max(0, s)) / 100, Math.min(100, Math.max(0, v)) / 100));

  const dark = rand() < 0.7;
  const hue = rand() * 360;
  const offset = rand() < 0.5 ? 30 + rand() * 40 : 150 + rand() * 60;
  const hue2 = (hue + offset) % 360;
  const tint = 6 + rand() * 10;

  if (dark) {
    const surface = hex(hue, tint, range(17, 6));
    const accent = hex(hue, range(70, 25), range(85, 15));
    return {
      name, elementTheme: "Dark",
      background: hex(hue, tint, range(11, 6)), surface, panel: surface,
      stage: hex(hue, tint, range(4, 4)), stroke: hex(hue, tint * 0.8, range(28, 8)),
      foreground: hex(hue, 4, 96), muted: hex(hue, 8, 65),
      accent, primary: accent, secondary: hex(hue2, range(55, 30), range(90, 10)),
    };
  }
  const surface = hex(hue, tint * 0.6, range(90, 5));
  return {
    name, elementTheme: "Light",
    background: hex(hue, tint, range(78, 6)), surface, panel: surface,
    stage: hex(hue, tint * 1.5, range(6, 6)), stroke: hex(hue, tint, range(66, 6)),
    foreground: hex(hue, 20, 12), muted: hex(hue, 15, 38),
    accent: hex(hue, range(80, 15), range(52, 12)),
    primary: hex(hue, range(75, 20), range(80, 15)),
    secondary: hex(hue2, range(50, 30), range(85, 12)),
  };
}

/** Black or white, whichever reads better on `hex`. */
function readableOn(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.4 ? "#0b0b0b" : "#ffffff";
}

/** Points the page's CSS variables at the theme. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  const vars: Record<string, string> = {
    "--bg": theme.background,
    "--panel": panelOf(theme),
    "--stage": stageOf(theme),
    "--stroke": strokeOf(theme),
    "--fg": theme.foreground,
    "--muted": theme.muted,
    "--accent": theme.accent,
    "--primary": theme.primary,
    "--secondary": theme.secondary,
    "--on-accent": readableOn(theme.accent),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = theme.elementTheme === "Dark" ? "dark" : "light";
}
