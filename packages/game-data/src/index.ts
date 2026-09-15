export type ItemForm = "solid" | "liquid" | "gas";
export type IconSize = 64 | 128 | 256;

export interface Item {
  /** Stable game class ID, e.g. Desc_IronPlate_C. */
  id: string;
  name: string;
  description: string;
  form: ItemForm;
  /** Whether the AWESOME Sink can consume this item continuously. */
  sinkable: boolean;
  /** Recipe quantities use pieces for solids, cubic metres for liquids and gases. */
  unit: "item" | "m3";
  iconId: string;
}

export interface Ingredient {
  itemId: string;
  /** Quantity per recipe cycle, in the referenced item's unit. */
  amount: number;
}

/** Machines that execute manufacturing recipes; mining and generation are separate systems. */
export interface Machine {
  id: string;
  name: string;
  description: string;
  descriptorId: string;
  iconId: string;
  manufacturingSpeed: number;
  power: { kind: "fixed"; megawatts: number } | { kind: "variable" };
  powerConsumptionExponent: number;
  canOverclock: boolean;
  /** Slots per machine; zero means amplification is unsupported. */
  sloopSlots: number;
  productionBoost: { base: number; perSloop: number; powerExponent: number };
}

/** A building that produces a fixed output without selecting a manufacturing recipe. */
export interface FixedProducer {
  id: string;
  name: string;
  description: string;
  descriptorId: string;
  iconId: string;
  durationSeconds: number;
  products: Ingredient[];
  powerMegawatts: number;
  canOverclock: boolean;
  events: string[];
}

/** Resource extraction is independent of manufacturing recipes. */
export interface Extractor {
  id: string;
  name: string;
  description: string;
  descriptorId: string;
  iconId: string;
  resourceIds: string[];
  powerMegawatts: number;
  powerConsumptionExponent: number;
  canOverclock: boolean;
}

/** Belt attachments; port counts describe planner slots on each side. */
export interface LogisticsPart {
  id: string;
  name: string;
  description: string;
  descriptorId: string;
  iconId: string;
  kind: "splitter" | "merger" | "smart-splitter" | "programmable-splitter";
}

/** The AWESOME Sink consumes delivered parts without a manufacturing recipe. */
export interface AwesomeSink {
  id: string;
  name: string;
  description: string;
  descriptorId: string;
  iconId: string;
  powerMegawatts: number;
}

export interface Recipe {
  id: string;
  name: string;
  durationSeconds: number;
  ingredients: Ingredient[];
  products: Ingredient[];
  machineIds: string[];
  alternate: boolean;
  /** Raw event identifiers, e.g. EV_Christmas. Empty means no recipe event restriction. */
  events: string[];
  /** Upstream cycle power parameters, relevant to variable-power machines. */
  variablePower: { constantMegawatts: number; factorMegawatts: number };
}

export interface GameCatalog {
  schemaVersion: 1;
  source: { locale: string; docsSha256: string };
  items: Record<string, Item>;
  machines: Record<string, Machine>;
  fixedProducers: Record<string, FixedProducer>;
  extractors: Record<string, Extractor>;
  logistics: Record<string, LogisticsPart>;
  sinks: Record<string, AwesomeSink>;
  recipes: Record<string, Recipe>;
}

export interface IconVariant {
  /** Relative to the generated artifact directory; UI chooses the serving base URL later. */
  path: string;
  width: IconSize;
  height: IconSize;
  bytes: number;
  sha256: string;
}

export interface PreparedIcon {
  /** SHA-256 of the decoded source RGBA pixels; shared by identical source images. */
  id: string;
  variants: Record<IconSize, IconVariant>;
}

export interface IconManifest {
  schemaVersion: 1;
  format: "webp";
  encoding: "lossless" | "quality90";
  icons: Record<string, PreparedIcon>;
}

/** Validate catalog semantics and cross-references before publishing generated artifacts. */
export function validateGameData(catalog: GameCatalog, manifest: IconManifest): void {
  const iconIds = new Set(Object.keys(manifest.icons));
  for (const [id, item] of Object.entries(catalog.items)) {
    check(id === item.id && Boolean(item.name.trim()), `Invalid item ${id}.`);
    check(["solid", "liquid", "gas"].includes(item.form), `Invalid form for ${id}.`);
    check(item.unit === (item.form === "solid" ? "item" : "m3"), `Invalid unit for ${id}.`);
    check(
      typeof item.sinkable === "boolean" && (!item.sinkable || item.form === "solid"),
      `Invalid sinkability for ${id}.`,
    );
    check(iconIds.has(item.iconId), `Missing icon for ${id}.`);
  }
  for (const [id, machine] of Object.entries(catalog.machines)) {
    check(id === machine.id && Boolean(machine.name.trim()), `Invalid machine ${id}.`);
    check(iconIds.has(machine.iconId), `Missing icon for ${id}.`);
    check(
      Number.isFinite(machine.manufacturingSpeed) && machine.manufacturingSpeed > 0,
      `Invalid speed for ${id}.`,
    );
    check(typeof machine.canOverclock === "boolean", `Invalid clock capability for ${id}.`);
    check(
      Number.isSafeInteger(machine.sloopSlots) &&
        machine.sloopSlots >= 0 &&
        machine.sloopSlots <= 4,
      `Invalid Sloop slots for ${id}.`,
    );
    check(
      machine.productionBoost?.base === 1 &&
        nonnegative(machine.productionBoost.perSloop) &&
        nonnegative(machine.productionBoost.powerExponent),
      `Invalid production boost for ${id}.`,
    );
    check(nonnegative(machine.powerConsumptionExponent), `Invalid power exponent for ${id}.`);
    if (machine.power.kind === "fixed")
      check(nonnegative(machine.power.megawatts), `Invalid power for ${id}.`);
  }
  for (const [id, producer] of Object.entries(catalog.fixedProducers)) {
    check(id === producer.id && Boolean(producer.name.trim()), `Invalid fixed producer ${id}.`);
    check(iconIds.has(producer.iconId), `Missing icon for ${id}.`);
    check(
      Number.isFinite(producer.durationSeconds) && producer.durationSeconds > 0,
      `Invalid duration for ${id}.`,
    );
    check(nonnegative(producer.powerMegawatts), `Invalid power for ${id}.`);
    check(typeof producer.canOverclock === "boolean", `Invalid overclocking flag for ${id}.`);
    check(
      producer.events.every((event) => /^EV_[A-Za-z0-9_]+$/.test(event)),
      `Invalid event for ${id}.`,
    );
    check(producer.products.length > 0, `Missing products for ${id}.`);
    check(
      new Set(producer.products.map((entry) => entry.itemId)).size === producer.products.length,
      `Duplicate product in ${id}.`,
    );
    for (const product of producer.products) {
      check(
        Object.hasOwn(catalog.items, product.itemId),
        `Missing item ${product.itemId} in ${id}.`,
      );
      check(Number.isFinite(product.amount) && product.amount > 0, `Invalid amount in ${id}.`);
    }
  }
  for (const [id, extractor] of Object.entries(catalog.extractors)) {
    check(id === extractor.id && Boolean(extractor.name.trim()), `Invalid extractor ${id}.`);
    check(iconIds.has(extractor.iconId), `Missing icon for ${id}.`);
    check(nonnegative(extractor.powerMegawatts), `Invalid power for ${id}.`);
    check(nonnegative(extractor.powerConsumptionExponent), `Invalid power exponent for ${id}.`);
    check(typeof extractor.canOverclock === "boolean", `Invalid clock capability for ${id}.`);
    check(
      extractor.resourceIds.length > 0 &&
        new Set(extractor.resourceIds).size === extractor.resourceIds.length,
      `Invalid resources for ${id}.`,
    );
    for (const resourceId of extractor.resourceIds)
      check(Object.hasOwn(catalog.items, resourceId), `Missing resource ${resourceId} for ${id}.`);
  }
  for (const [id, part] of Object.entries(catalog.logistics)) {
    check(id === part.id && Boolean(part.name.trim()), `Invalid logistics part ${id}.`);
    check(
      ["splitter", "merger", "smart-splitter", "programmable-splitter"].includes(part.kind),
      `Invalid logistics kind for ${id}.`,
    );
    check(iconIds.has(part.iconId), `Missing icon for ${id}.`);
  }
  check(Boolean(catalog.sinks), "Missing AWESOME Sink catalog; prepare game assets again.");
  for (const [id, sink] of Object.entries(catalog.sinks)) {
    check(id === sink.id && Boolean(sink.name.trim()), `Invalid AWESOME Sink ${id}.`);
    check(iconIds.has(sink.iconId), `Missing icon for ${id}.`);
    check(nonnegative(sink.powerMegawatts), `Invalid power for ${id}.`);
  }
  for (const [id, recipe] of Object.entries(catalog.recipes)) {
    check(id === recipe.id && Boolean(recipe.name.trim()), `Invalid recipe ${id}.`);
    check(
      Number.isFinite(recipe.durationSeconds) && recipe.durationSeconds > 0,
      `Invalid duration for ${id}.`,
    );
    check(recipe.products.length > 0 && recipe.machineIds.length > 0, `Incomplete recipe ${id}.`);
    check(
      new Set(recipe.machineIds).size === recipe.machineIds.length,
      `Duplicate machine in ${id}.`,
    );
    for (const machineId of recipe.machineIds)
      check(Object.hasOwn(catalog.machines, machineId), `Missing machine ${machineId} in ${id}.`);
    for (const list of [recipe.ingredients, recipe.products]) {
      check(
        new Set(list.map((entry) => entry.itemId)).size === list.length,
        `Duplicate item in ${id}.`,
      );
      for (const entry of list) {
        check(Object.hasOwn(catalog.items, entry.itemId), `Missing item ${entry.itemId} in ${id}.`);
        check(Number.isFinite(entry.amount) && entry.amount > 0, `Invalid amount in ${id}.`);
      }
    }
    check(
      nonnegative(recipe.variablePower.constantMegawatts) &&
        nonnegative(recipe.variablePower.factorMegawatts),
      `Invalid variable power in ${id}.`,
    );
  }
  for (const [id, icon] of Object.entries(manifest.icons)) {
    check(id === icon.id && /^[a-f0-9]{64}$/.test(id), `Invalid icon ID ${id}.`);
    for (const size of [64, 128, 256] as const) {
      const variant = icon.variants[size];
      check(
        Boolean(variant) && variant.width === size && variant.height === size,
        `Invalid ${size}px variant for ${id}.`,
      );
      check(
        Number.isSafeInteger(variant.bytes) &&
          variant.bytes > 0 &&
          /^[a-f0-9]{64}$/.test(variant.sha256),
        `Invalid image metadata for ${id}.`,
      );
      check(variant.path === `icons/${variant.sha256}.webp`, `Invalid image path for ${id}.`);
    }
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
function nonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
