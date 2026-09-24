const decimal = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const fractions = [
  [1 / 8, "⅛", "1/8"],
  [1 / 6, "⅙", "1/6"],
  [1 / 4, "¼", "1/4"],
  [1 / 3, "⅓", "1/3"],
  [3 / 8, "⅜", "3/8"],
  [1 / 2, "½", "1/2"],
  [5 / 8, "⅝", "5/8"],
  [2 / 3, "⅔", "2/3"],
  [3 / 4, "¾", "3/4"],
  [5 / 6, "⅚", "5/6"],
  [7 / 8, "⅞", "7/8"],
] as const;

/** Display only: recognize common fractions within solver tolerance, never change stored rates. */
export function formatPlanningNumber(
  value: number,
  fractionStyle: "unicode" | "mixed" = "unicode",
): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  const whole = Math.floor(magnitude);
  const fraction = fractions.find(([part]) => Math.abs(magnitude - whole - part) < 1e-7);
  if (fraction) {
    const suffix = fractionStyle === "mixed" ? `${whole ? " " : ""}${fraction[2]}` : fraction[1];
    return `${value < 0 ? "−" : ""}${whole ? decimal.format(whole) : ""}${suffix}`;
  }
  return decimal.format(Math.abs(value) < 0.005 ? 0 : value);
}
