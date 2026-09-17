import type { GameCatalog } from "./index";

export type SearchKind =
  | "facility"
  | "recipe"
  | "machine"
  | "extractor"
  | "fixed-producer"
  | "logistics"
  | "sink"
  | "resource";
export type SearchEntry = Readonly<{
  id: string;
  entityId: string;
  kind: SearchKind;
  name: string;
  iconId: string;
  subtitle: string;
  productionRate?: string;
  machineSummary?: string;
  alternate: boolean;
  events: readonly string[];
  machineIds: readonly string[];
  extractorId?: string;
  /** Prepared once, independent of UI state and image loading. */
  normalizedName: string;
  terms: string;
  words: readonly string[];
}>;
export type SearchScope = Readonly<{ kind: "machine" | "extractor"; id: string }>;
export type SearchOptions = Readonly<{
  category?: "all" | "recipes" | "buildings";
  scope?: SearchScope;
  /**
   * Optional eligibility boundary, applied before ranking (including typo fallback).
   * IDs are SearchEntry.id, not entityId. Omitted means unrestricted; empty means no results.
   * The material-link resolver owns compatibility rules and includes eligible parent
   * buildings and recipe/resource choices. Replace the set when eligibility changes.
   */
  allowedEntryIds?: ReadonlySet<string>;
}>;

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\bmk\.?\s*(\d+)/g, "mk$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function searchInitialism(name: string): string {
  const initials = normalizeSearch(name)
    .split(" ")
    .map((word) => word[0])
    .join("");
  return initials.length >= 3 ? initials : "";
}

export function createSearchIndex(catalog: GameCatalog): readonly SearchEntry[] {
  const entries: SearchEntry[] = [];
  function add(entry: Omit<SearchEntry, "normalizedName" | "terms" | "words">, extra = "") {
    const terms = normalizeSearch(`${entry.name} ${extra} ${searchInitialism(entry.name)}`);
    entries.push({
      ...entry,
      normalizedName: normalizeSearch(entry.name),
      terms,
      words: terms.split(" "),
    });
  }
  const base = { alternate: false, events: [], machineIds: [] };
  for (const recipe of Object.values(catalog.recipes)) {
    const machines = recipe.machineIds.map((id) => catalog.machines[id]!.name).join(" · ");
    const products = recipe.products.map((p) => catalog.items[p.itemId]!.name).join(" + ");
    const productInitials = recipe.products
      .map((p) => searchInitialism(catalog.items[p.itemId]!.name))
      .join(" ");
    add(
      {
        ...base,
        id: `recipe:${recipe.id}`,
        entityId: recipe.id,
        kind: "recipe",
        name: recipe.alternate ? recipe.name.replace(/^Alternate:\s*/i, "") : recipe.name,
        iconId: catalog.items[recipe.products[0]!.itemId]!.iconId,
        subtitle: recipeSearchSummary(catalog, recipe.id),
        productionRate: recipeProductionRate(catalog, recipe.id),
        machineSummary: recipeMachineSummary(catalog, recipe.machineIds[0]!),
        alternate: recipe.alternate,
        events: recipe.events,
        machineIds: recipe.machineIds,
      },
      `${machines} ${products} ${productInitials} ${recipe.alternate ? "alt alternate alternative" : "standard"}`,
    );
  }
  const collections = [
    ["machine", catalog.machines, "Choose recipe"],
    ["extractor", catalog.extractors, "Choose resource"],
    ["fixed-producer", catalog.fixedProducers, "Fixed producer"],
    ["logistics", catalog.logistics, "Logistics"],
    ["sink", catalog.sinks, "AWESOME Sink"],
    ["facility", catalog.buildings ?? {}, "Building"],
  ] as const;
  for (const [kind, entities, subtitle] of collections) {
    for (const entity of Object.values(entities)) {
      add(
        {
          ...base,
          id: `${kind}:${entity.id}`,
          entityId: entity.id,
          kind,
          name: entity.name,
          iconId: entity.iconId,
          subtitle,
          events: "events" in entity ? entity.events : [],
        },
        kind === "sink"
          ? "awesome sink"
          : kind === "facility" && "kind" in entity && entity.kind === "well"
            ? "resource well extractor nitrogen gas crude oil water"
            : "",
      );
    }
  }
  for (const extractor of Object.values(catalog.extractors)) {
    for (const id of extractor.resourceIds) {
      const item = catalog.items[id]!;
      add({
        ...base,
        id: `resource:${extractor.id}:${id}`,
        entityId: id,
        kind: "resource",
        name: item.name,
        iconId: item.iconId,
        subtitle: extractor.name,
        extractorId: extractor.id,
      });
    }
  }
  return entries.toSorted(
    (a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id, "en"),
  );
}

/** All query tokens must match; name matches outrank related machine/output matches. */
export function searchCatalog(
  index: readonly SearchEntry[],
  query: string,
  options: SearchOptions = {},
): readonly SearchEntry[] {
  const normalized = normalizeSearch(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const ranked: SearchEntry[][] = [[], [], [], []];
  const candidates: SearchEntry[] = [];
  for (const entry of index) {
    if (options.allowedEntryIds && !options.allowedEntryIds.has(entry.id)) continue;
    if (options.scope) {
      if (
        options.scope.kind === "machine"
          ? entry.kind !== "recipe" || !entry.machineIds.includes(options.scope.id)
          : entry.kind !== "resource" || entry.extractorId !== options.scope.id
      )
        continue;
    } else {
      if (entry.kind === "resource") continue;
      if (options.category === "recipes" && entry.kind !== "recipe") continue;
      if (options.category === "buildings" && entry.kind === "recipe") continue;
    }
    candidates.push(entry);
    if (!tokens.every((token) => entry.terms.includes(token))) continue;
    const rank = !normalized
      ? 0
      : entry.normalizedName === normalized
        ? 0
        : entry.normalizedName.startsWith(normalized)
          ? 1
          : tokens.every((token) => entry.normalizedName.includes(token))
            ? 2
            : 3;
    ranked[rank]!.push(entry);
  }
  const matches = ranked.flat();
  // Only pay for fuzzy matching if the entire direct-match pass found nothing.
  return matches.length
    ? matches
    : candidates.filter((entry) =>
        tokens.every(
          (token) =>
            entry.terms.includes(token) ||
            (token.length >= 4 && entry.words.some((word) => oneEditApart(token, word))),
        ),
      );
}

/** Bounded typo fallback; no matrix allocation or fuzzy matching of short tokens. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const number = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

/** Primary output at default clock and no amplification. */
export function recipeProductionRate(
  catalog: GameCatalog,
  recipeId: string,
  machineId?: string,
): string {
  const recipe = catalog.recipes[recipeId]!;
  const product = recipe.products[0]!;
  const machine = catalog.machines[machineId ?? recipe.machineIds[0]!]!;
  const rate = number.format(
    (product.amount * 60 * machine.manufacturingSpeed) / recipe.durationSeconds,
  );
  return `${rate}${catalog.items[product.itemId]!.unit === "m3" ? " m³/min" : "/min"}`;
}

function recipeMachineSummary(catalog: GameCatalog, machineId: string): string {
  const machine = catalog.machines[machineId]!;
  const power =
    machine.power.kind === "fixed"
      ? `${number.format(machine.power.megawatts)} MW`
      : "Variable power";
  return `${machine.name} · ${power}`;
}

/** Compact baseline summary: default clock, primary product, no amplification. */
export function recipeSearchSummary(
  catalog: GameCatalog,
  recipeId: string,
  machineId?: string,
): string {
  return catalog.recipes[recipeId]!.machineIds.filter((id) => !machineId || id === machineId)
    .map(
      (id) =>
        `${recipeMachineSummary(catalog, id)} · ${recipeProductionRate(catalog, recipeId, id)}`,
    )
    .join("; ");
}

/** Recipes producing the same primary item, including the standard recipe when inspecting an alternate. */
export function recipeAlternatives(catalog: GameCatalog, recipeId: string): readonly string[] {
  const recipe = catalog.recipes[recipeId];
  if (!recipe) return [];
  const productId = recipe.products[0]!.itemId;
  return Object.values(catalog.recipes)
    .filter((candidate) => candidate.id !== recipeId && candidate.products[0]?.itemId === productId)
    .toSorted(
      (a, b) => Number(a.alternate) - Number(b.alternate) || a.name.localeCompare(b.name, "en"),
    )
    .map((candidate) => candidate.id);
}

export type RecipeComparison = Readonly<{
  outputPerMinute: number;
  itemId: string;
  machineId: string;
  machines: number;
  baselinePowerMegawatts: number | null;
  powerMegawatts: number | null;
  addedInputIds: readonly string[];
  removedInputIds: readonly string[];
  baselineInputTypes: number;
  inputTypes: number;
  fluidInputIds: readonly string[];
  byproducts: readonly { itemId: string; amountPerMinute: number }[];
}>;

/** Equal primary output, full-speed machine equivalents; no upstream power or amplification. */
export function compareRecipes(
  catalog: GameCatalog,
  baselineId: string,
  candidateId: string,
  preferredMachineId?: string,
): RecipeComparison | undefined {
  const baseline = catalog.recipes[baselineId];
  const candidate = catalog.recipes[candidateId];
  if (!baseline || !candidate || baseline.products[0]?.itemId !== candidate.products[0]?.itemId)
    return undefined;
  const machineFor = (recipe: typeof baseline) =>
    catalog.machines[
      preferredMachineId && recipe.machineIds.includes(preferredMachineId)
        ? preferredMachineId
        : recipe.machineIds[0]!
    ]!;
  const baseMachine = machineFor(baseline);
  const machine = machineFor(candidate);
  const outputPerMinute =
    (baseline.products[0]!.amount * 60 * baseMachine.manufacturingSpeed) / baseline.durationSeconds;
  const candidateRate =
    (candidate.products[0]!.amount * 60 * machine.manufacturingSpeed) / candidate.durationSeconds;
  const machines = outputPerMinute / candidateRate;
  const baseInputs = new Set(baseline.ingredients.map((input) => input.itemId));
  const inputs = new Set(candidate.ingredients.map((input) => input.itemId));
  return {
    outputPerMinute,
    itemId: baseline.products[0]!.itemId,
    machineId: machine.id,
    machines,
    baselinePowerMegawatts: baseMachine.power.kind === "fixed" ? baseMachine.power.megawatts : null,
    powerMegawatts: machine.power.kind === "fixed" ? machine.power.megawatts * machines : null,
    addedInputIds: [...inputs].filter((id) => !baseInputs.has(id)),
    removedInputIds: [...baseInputs].filter((id) => !inputs.has(id)),
    baselineInputTypes: baseInputs.size,
    inputTypes: inputs.size,
    fluidInputIds: [...inputs].filter((id) => catalog.items[id]!.form !== "solid"),
    byproducts: candidate.products.slice(1).map((product) => ({
      itemId: product.itemId,
      amountPerMinute: (product.amount * outputPerMinute) / candidate.products[0]!.amount,
    })),
  };
}
