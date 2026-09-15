import type { GameCatalog } from "./index";

export type SearchKind =
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

export function createSearchIndex(catalog: GameCatalog): readonly SearchEntry[] {
  const entries: SearchEntry[] = [];
  function add(entry: Omit<SearchEntry, "normalizedName" | "terms" | "words">, extra = "") {
    const terms = normalizeSearch(`${entry.name} ${extra}`);
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
    add(
      {
        ...base,
        id: `recipe:${recipe.id}`,
        entityId: recipe.id,
        kind: "recipe",
        name: recipe.alternate ? recipe.name.replace(/^Alternate:\s*/i, "") : recipe.name,
        iconId: catalog.items[recipe.products[0]!.itemId]!.iconId,
        subtitle: recipeSearchSummary(catalog, recipe.id),
        alternate: recipe.alternate,
        events: recipe.events,
        machineIds: recipe.machineIds,
      },
      `${machines} ${products} ${recipe.alternate ? "alt alternate alternative" : "standard"}`,
    );
  }
  const collections = [
    ["machine", catalog.machines, "Choose recipe"],
    ["extractor", catalog.extractors, "Choose resource"],
    ["fixed-producer", catalog.fixedProducers, "Fixed producer"],
    ["logistics", catalog.logistics, "Logistics"],
    ["sink", catalog.sinks, "AWESOME Sink"],
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
        kind === "sink" ? "awesome sink" : "",
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
  const ranked: { entry: SearchEntry; rank: number }[] = [];
  const fallback: SearchEntry[] = [];
  for (const entry of index) {
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
    if (!tokens.every((token) => entry.terms.includes(token))) {
      if (
        tokens.every(
          (token) =>
            entry.terms.includes(token) ||
            (token.length >= 4 && entry.words.some((word) => oneEditApart(token, word))),
        )
      )
        fallback.push(entry);
      continue;
    }
    const rank = !normalized
      ? 0
      : entry.normalizedName === normalized
        ? 0
        : entry.normalizedName.startsWith(normalized)
          ? 1
          : tokens.every((token) => entry.normalizedName.includes(token))
            ? 2
            : 3;
    ranked.push({ entry, rank });
  }
  return ranked.length
    ? ranked.toSorted((a, b) => a.rank - b.rank).map(({ entry }) => entry)
    : fallback;
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

/** Compact baseline summary: one machine, default clock, primary product, no amplification. */
export function recipeSearchSummary(
  catalog: GameCatalog,
  recipeId: string,
  machineId?: string,
): string {
  const recipe = catalog.recipes[recipeId]!;
  const product = recipe.products[0]!;
  const unit = catalog.items[product.itemId]!.unit === "m3" ? "m³/min" : "/min";
  return recipe.machineIds
    .filter((id) => !machineId || id === machineId)
    .map((id) => {
      const machine = catalog.machines[id]!;
      const power =
        machine.power.kind === "fixed"
          ? `${number.format(machine.power.megawatts)} MW`
          : "Variable power";
      const rate = number.format(
        (product.amount * 60 * machine.manufacturingSpeed) / recipe.durationSeconds,
      );
      return `${machine.name} · ${power} · ${rate}${unit === "/min" ? "" : " "}${unit}`;
    })
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
