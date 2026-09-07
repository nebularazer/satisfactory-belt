export type MaterialFlowState =
  | "balanced"
  | "overloaded"
  | "shortage"
  | "surplus"
  | "unresolved";

export const MATERIAL_FLOW_PALETTE = {
  balanced: {
    canvas: { dark: 0x65b6a2, light: 0x347f6d },
    dotClass: "bg-emerald-500",
    label: "Balanced",
    panelClass:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  overloaded: {
    canvas: { dark: 0xe07178, light: 0xb84650 },
    dotClass: "bg-red-500",
    label: "Overloaded",
    panelClass:
      "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  },
  shortage: {
    canvas: { dark: 0xe0a847, light: 0xa96f16 },
    dotClass: "bg-amber-500",
    label: "Undersupplied",
    panelClass:
      "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  surplus: {
    canvas: { dark: 0x69a9dc, light: 0x397bab },
    dotClass: "bg-sky-500",
    label: "Surplus",
    panelClass:
      "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  unresolved: {
    canvas: { dark: 0x96a0ae, light: 0x647184 },
    dotClass: "bg-slate-500",
    label: "Unresolved",
    panelClass:
      "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
} as const satisfies Record<
  MaterialFlowState,
  Readonly<{
    canvas: Readonly<{ dark: number; light: number }>;
    dotClass: string;
    label: string;
    panelClass: string;
  }>
>;

export function classifyMaterialFlowState(
  diagnosticCodes: readonly string[],
  resolved: boolean,
): MaterialFlowState {
  if (!resolved || diagnosticCodes.some((code) => code.includes("feedback"))) {
    return "unresolved";
  }
  if (diagnosticCodes.some((code) => code.includes("overload"))) {
    return "overloaded";
  }
  if (diagnosticCodes.some((code) => code.includes("shortage"))) {
    return "shortage";
  }
  if (diagnosticCodes.some((code) => code.includes("surplus"))) {
    return "surplus";
  }
  return "balanced";
}

export function materialFlowCanvasColor(
  state: MaterialFlowState,
  dark: boolean,
) {
  const colors = MATERIAL_FLOW_PALETTE[state].canvas;
  return dark ? colors.dark : colors.light;
}
