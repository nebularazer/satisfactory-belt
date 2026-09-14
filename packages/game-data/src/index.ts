export type ItemForm = "solid" | "liquid" | "gas";
export type IconSize = 64 | 128 | 256;

export interface Item {
  /** Stable game class ID, e.g. Desc_IronPlate_C. */
  id: string;
  name: string;
  description: string;
  form: ItemForm;
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
    check(iconIds.has(item.iconId), `Missing icon for ${id}.`);
  }
  for (const [id, machine] of Object.entries(catalog.machines)) {
    check(id === machine.id && Boolean(machine.name.trim()), `Invalid machine ${id}.`);
    check(iconIds.has(machine.iconId), `Missing icon for ${id}.`);
    check(
      Number.isFinite(machine.manufacturingSpeed) && machine.manufacturingSpeed > 0,
      `Invalid speed for ${id}.`,
    );
    check(nonnegative(machine.powerConsumptionExponent), `Invalid power exponent for ${id}.`);
    if (machine.power.kind === "fixed")
      check(nonnegative(machine.power.megawatts), `Invalid power for ${id}.`);
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
