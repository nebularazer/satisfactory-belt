const decimal = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const fractions = [
  [1 / 8, "⅛"],
  [1 / 6, "⅙"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [5 / 6, "⅚"],
  [7 / 8, "⅞"],
] as const;

/** Display only: recognize common fractions within solver tolerance, never change stored rates. */
export function formatPlanningNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  const whole = Math.floor(magnitude);
  const fraction = fractions.find(([part]) => Math.abs(magnitude - whole - part) < 1e-7);
  if (fraction) return `${value < 0 ? "−" : ""}${whole ? decimal.format(whole) : ""}${fraction[1]}`;
  return decimal.format(Math.abs(value) < 0.005 ? 0 : value);
}
