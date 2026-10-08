import type { GameCatalog, Ingredient } from "./index";

export type SearchKind =
  | "facility"
  | "recipe"
  | "machine"
  | "extractor"
  | "fixed-producer"
  | "logistics"
  | "sink"
  | "resource";
export type SearchDirection = "produces" | "consumes";
export type SearchMaterial = Readonly<{
  itemId: string;
  name: string;
  normalizedName: string;
  terms: string;
  words: readonly string[];
  unit: "item" | "m3";
  perMinute?: number;
}>;
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
  initialism: string;
  nameWords: readonly string[];
  terms: string;
  words: readonly string[];
  inputs: readonly SearchMaterial[];
  outputs: readonly SearchMaterial[];
}>;
export type SearchScope = Readonly<{ kind: "machine" | "extractor"; id: string }>;
export type SearchOptions = Readonly<{
  category?: "all" | "recipes" | "buildings";
  scope?: SearchScope;
  /** In direction mode the query matches individual input/output items, not recipe names. */
  direction?: SearchDirection;
  /** A selected material restricts direction mode; the query then narrows recipe names. */
  itemId?: string;
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
  function materials(
    quantities: readonly Ingredient[],
    cycles?: number,
  ): readonly SearchMaterial[] {
    return quantities.map(({ itemId, amount }) => {
      const item = catalog.items[itemId]!;
      const normalizedName = normalizeSearch(item.name);
      const terms = `${normalizedName} ${searchInitialism(item.name)}`.trim();
      return {
        itemId,
        name: item.name,
        normalizedName,
        terms,
        words: terms.split(" "),
        unit: item.unit,
        perMinute: cycles === undefined ? undefined : amount * cycles,
      };
    });
  }
  function add(
    entry: Omit<SearchEntry, "normalizedName" | "initialism" | "nameWords" | "terms" | "words">,
    extra = "",
  ) {
    const terms = normalizeSearch(`${entry.name} ${extra} ${searchInitialism(entry.name)}`);
    entries.push({
      ...entry,
      normalizedName: normalizeSearch(entry.name),
      initialism: searchInitialism(entry.name),
      nameWords: normalizeSearch(entry.name).split(" "),
      terms,
      words: terms.split(" "),
    });
  }
  const base = { alternate: false, events: [], machineIds: [], inputs: [], outputs: [] };
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
        inputs: materials(
          recipe.ingredients,
          (60 * catalog.machines[recipe.machineIds[0]!]!.manufacturingSpeed) /
            recipe.durationSeconds,
        ),
        outputs: materials(
          recipe.products,
          (60 * catalog.machines[recipe.machineIds[0]!]!.manufacturingSpeed) /
            recipe.durationSeconds,
        ),
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
      if (kind === "facility" && "kind" in entity && entity.kind === "freight-platform") continue;
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
          outputs:
            "products" in entity ? materials(entity.products, 60 / entity.durationSeconds) : [],
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
      add(
        {
          ...base,
          id: `resource:${extractor.id}:${id}`,
          entityId: id,
          kind: "resource",
          name: item.name,
          iconId: item.iconId,
          subtitle: extractor.name,
          extractorId: extractor.id,
          outputs: materials([{ itemId: id, amount: 1 }], extractor.baseRate),
        },
        extractor.name,
      );
    }
  }
  return entries.toSorted(
    (a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id, "en"),
  );
}

/** All query tokens must match; names and their abbreviations outrank related terms. */
export function searchCatalog(
  index: readonly SearchEntry[],
  query: string,
  options: SearchOptions = {},
): readonly SearchEntry[] {
  const normalized = normalizeSearch(query);
  const tokens = normalized.split(" ").filter(Boolean);
  // Complete item names select that material, rather than similarly named packaged
  // items. Resolve before eligibility/scope so filters cannot change the query's meaning.
  const exactMaterialIds = new Set<string>();
  if (options.direction && normalized && !options.itemId) {
    for (const entry of index) {
      for (const material of [...entry.inputs, ...entry.outputs]) {
        if (material.normalizedName === normalized) exactMaterialIds.add(material.itemId);
      }
    }
  }
  const candidates = index.filter((entry) => {
    if (options.allowedEntryIds && !options.allowedEntryIds.has(entry.id)) return false;
    if (options.scope) {
      if (
        options.scope.kind === "machine"
          ? entry.kind !== "recipe" || !entry.machineIds.includes(options.scope.id)
          : entry.kind !== "resource" || entry.extractorId !== options.scope.id
      )
        return false;
    } else {
      const production = entry.kind === "recipe" || entry.kind === "resource";
      if (options.category === "recipes" && !production) return false;
      if (options.category === "buildings" && production) return false;
    }
    if (options.direction) {
      const materials = options.direction === "consumes" ? entry.inputs : entry.outputs;
      return materials.some((material) => !options.itemId || material.itemId === options.itemId);
    }
    return true;
  });
  function rank(entry: SearchEntry, fuzzy: boolean): number | undefined {
    const matches = (terms: string, words: readonly string[]) =>
      tokens.every(
        (token) =>
          terms.includes(token) ||
          (fuzzy && token.length >= 4 && words.some((word) => oneEditApart(token, word))),
      );
    if (options.direction && !options.itemId) {
      const materials = options.direction === "consumes" ? entry.inputs : entry.outputs;
      const matching = materials.filter(
        (material) =>
          (!exactMaterialIds.size || exactMaterialIds.has(material.itemId)) &&
          matches(material.terms, material.words),
      );
      if (!matching.length) return undefined;
      return !normalized || matching.some((material) => material.normalizedName === normalized)
        ? 0
        : 1;
    }
    if (!matches(entry.terms, entry.words)) return undefined;
    if (!normalized || entry.normalizedName === normalized) return 0;
    if (entry.initialism === normalized) return 1;
    if (entry.normalizedName.startsWith(normalized)) return 2;
    if (matches(entry.normalizedName, entry.nameWords)) return 3;
    return 4;
  }
  function ranked(fuzzy: boolean) {
    const buckets: SearchEntry[][] = [[], [], [], [], []];
    for (const entry of candidates) {
      const score = rank(entry, fuzzy);
      if (score !== undefined) buckets[score]!.push(entry);
    }
    return buckets.flat();
  }
  const direct = ranked(false);
  // Keep fuzzy work bounded to the empty direct-match case and eligible candidates.
  return direct.length ? direct : ranked(true);
}

/** One insertion, deletion, replacement, or adjacent transposition; no distance matrix. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (i === a.length) return b.length - i <= 1;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Prepared material matches for an item query or a known connection material. */
export function matchingSearchMaterials(
  entry: SearchEntry,
  query: string,
  direction: SearchDirection = "produces",
  itemIds?: readonly string[],
): readonly SearchMaterial[] {
  const materials = direction === "consumes" ? entry.inputs : entry.outputs;
  if (itemIds) return materials.filter((material) => itemIds.includes(material.itemId));
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  const matches = materials.filter((material) =>
    tokens.every((token) => material.terms.includes(token)),
  );
  return matches.length
    ? matches
    : materials.filter((material) =>
        tokens.every(
          (token) =>
            material.terms.includes(token) ||
            (token.length >= 4 && material.words.some((word) => oneEditApart(token, word))),
        ),
      );
}

export function searchMaterialRate(material: SearchMaterial, multiplier = 1): string {
  return material.perMinute === undefined
    ? material.name
    : `${number.format(material.perMinute * multiplier)}${material.unit === "m3" ? " m³/min" : "/min"} · ${material.name}`;
}

/** Compact flow names and explicitly labelled rates, scaled to the selected machine. */
export function searchEntrySummary(
  catalog: GameCatalog,
  entry: SearchEntry,
  query: string,
  direction: SearchDirection = "produces",
  itemIds?: readonly string[],
  machineId?: string,
): Readonly<{ machine: string; flow: string; rate: string }> {
  const recipe = entry.kind === "recipe" ? catalog.recipes[entry.entityId] : undefined;
  const multiplier =
    recipe && machineId && recipe.machineIds.includes(machineId)
      ? catalog.machines[machineId]!.manufacturingSpeed /
        catalog.machines[recipe.machineIds[0]!]!.manufacturingSpeed
      : 1;
  const matched = matchingSearchMaterials(entry, query, direction, itemIds);
  const rateMaterials = matched.length
    ? matched
    : itemIds
      ? []
      : direction === "consumes"
        ? entry.inputs
        : entry.outputs.slice(0, 1);
  return {
    machine: recipe
      ? recipeMachineSummary(
          catalog,
          machineId && recipe.machineIds.includes(machineId) ? machineId : recipe.machineIds[0]!,
        )
      : entry.subtitle,
    flow: [
      entry.inputs.map((material) => material.name).join(" + "),
      entry.outputs.map((material) => material.name).join(" + "),
    ]
      .filter(Boolean)
      .join(" → "),
    rate: rateMaterials.map((material) => searchMaterialRate(material, multiplier)).join("; "),
  };
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
