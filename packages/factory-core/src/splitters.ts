import type { GameCatalog, LogisticsPart } from "@satisfactory-belt/game-data";

export type SplitterRule =
  | Readonly<{ kind: "item"; itemId: string }>
  | Readonly<{ kind: "any" | "none" | "any-undefined" | "overflow" }>;
export type SplitterOutput = "output:0" | "output:1" | "output:2";
export type SplitterProgram = Readonly<Record<SplitterOutput, readonly SplitterRule[]>>;
export type MaterialFilter = Readonly<{
  rules: readonly SplitterRule[];
  /** Specific items named anywhere in the splitter's program. */
  definedItems: ReadonlySet<string>;
}>;
export const DEFAULT_SPLITTER_PROGRAM: SplitterProgram = Object.freeze({
  "output:0": Object.freeze([Object.freeze({ kind: "none" as const })]),
  "output:1": Object.freeze([Object.freeze({ kind: "any" as const })]),
  "output:2": Object.freeze([Object.freeze({ kind: "none" as const })]),
});
export const MAX_SPLITTER_RULES = 64;
export const SPLITTER_OUTPUTS: readonly SplitterOutput[] = ["output:0", "output:1", "output:2"];

export function validateSplitterProgram(
  kind: LogisticsPart["kind"],
  program: SplitterProgram | undefined,
  catalog: GameCatalog,
) {
  if (kind !== "smart-splitter" && kind !== "programmable-splitter") {
    if (program !== undefined)
      throw new Error("Only smart and programmable splitters have output rules.");
    return;
  }
  const rules = program ?? DEFAULT_SPLITTER_PROGRAM;
  if (
    Object.keys(rules).length !== 3 ||
    !SPLITTER_OUTPUTS.every((key) => Array.isArray(rules[key]))
  )
    throw new Error("A splitter program must define its three output slots.");
  let total = 0;
  for (const output of SPLITTER_OUTPUTS) {
    const filters = rules[output];
    if (kind === "smart-splitter" && filters.length > 1)
      throw new Error("A smart splitter supports at most one rule per output.");
    const seen = new Set<string>();
    for (const filter of filters) {
      if (!filter || !["item", "any", "none", "any-undefined", "overflow"].includes(filter.kind))
        throw new Error("Invalid splitter rule.");
      if (filter.kind === "item" && catalog.items[filter.itemId]?.form !== "solid")
        throw new Error(`Splitter filters require a solid material: ${filter.itemId}.`);
      const key = filter.kind === "item" ? `item:${filter.itemId}` : filter.kind;
      if (seen.has(key)) throw new Error(`Duplicate rule on ${output}.`);
      seen.add(key);
    }
    total += filters.length;
  }
  if (total > MAX_SPLITTER_RULES)
    throw new Error("A programmable splitter supports at most 64 rules.");
}

export function splitterFilters(
  program: SplitterProgram = DEFAULT_SPLITTER_PROGRAM,
): ReadonlyMap<string, MaterialFilter> {
  const definedItems = new Set(
    Object.values(program).flatMap((rules) =>
      rules.flatMap((rule) => (rule.kind === "item" ? [rule.itemId] : [])),
    ),
  );
  return new Map(
    SPLITTER_OUTPUTS.map((output) => [output, { rules: program[output], definedItems }]),
  );
}

/** Overflow can carry any incoming item if other outputs back up; capacity is not simulated. */
export function filterAllows(filter: MaterialFilter | undefined, itemId: string): boolean {
  return (
    !filter ||
    filter.rules.some((rule) => {
      if (rule.kind === "item") return rule.itemId === itemId;
      if (rule.kind === "any-undefined") return !filter.definedItems.has(itemId);
      return rule.kind === "any" || rule.kind === "overflow";
    })
  );
}
