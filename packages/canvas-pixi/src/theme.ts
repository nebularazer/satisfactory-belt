export type CanvasTheme = "light" | "dark";

export const CANVAS_PALETTES = {
  light: {
    background: "#fafafa",
    grid: [204 / 255, 205 / 255, 214 / 255],
    card: "#ffffff",
    border: "#d8d9e0",
    separator: "#ececf0",
    title: "#30313b",
    muted: "#757681",
    footer: "#656774",
    selection: "#6960d9",
    placeholder: "#f0f0f3",
    input: { stroke: "#d77732", fill: "#fff0df" },
    output: { stroke: "#239c83", fill: "#e1f5ed" },
    power: { stroke: "#cd921a", fill: "#f7ce65" },
    clock: { stroke: "#3299b5", fill: "#e2f3fb" },
  },
  dark: {
    background: "#18181b",
    grid: [63 / 255, 63 / 255, 70 / 255],
    card: "#27272a",
    border: "#52525b",
    separator: "#3f3f46",
    title: "#f4f4f5",
    muted: "#a1a1aa",
    footer: "#b4b4bd",
    selection: "#a69fff",
    placeholder: "#3f3f46",
    input: { stroke: "#ed994f", fill: "#4a3020" },
    output: { stroke: "#4cc6a5", fill: "#193e35" },
    power: { stroke: "#f7ce65", fill: "#70551c" },
    clock: { stroke: "#70cce3", fill: "#204653" },
  },
} as const;

export type CanvasPalette = (typeof CANVAS_PALETTES)[CanvasTheme];
