import type { Model } from "javascript-lp-solver";

/** Minimize pairwise differences after targets and throughput have been fixed.
 * Unlike minimizing only the largest branch, this redistributes unused shares
 * even when another sibling is already constrained by its own capacity.
 */
export function addFlowSharing(model: Model, families: Iterable<readonly string[]>) {
  const costs: Record<string, number> = {};
  let pair = 0;
  for (const family of families) {
    for (let i = 0; i < family.length; i++) {
      for (let j = i + 1; j < family.length; j++) {
        const id = `sharing:${pair++}`;
        const positive = `${id}:positive`;
        const negative = `${id}:negative`;
        model.constraints[positive] = { min: 0 };
        model.constraints[negative] = { min: 0 };
        model.variables[family[i]!]![positive] = -1;
        model.variables[family[j]!]![positive] = 1;
        model.variables[family[i]!]![negative] = 1;
        model.variables[family[j]!]![negative] = -1;
        model.variables[id] = { [positive]: 1, [negative]: 1 };
        costs[id] = 1;
      }
    }
  }
  return costs;
}
