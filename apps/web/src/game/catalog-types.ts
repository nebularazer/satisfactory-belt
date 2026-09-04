export type CatalogBuildable = Readonly<{
  id: string;
  imageUrl: string;
  name: string;
  searchTerms?: readonly string[];
}>;

export type ProductionMachine = CatalogBuildable &
  Readonly<{
    basePowerMw: number;
  }>;

export type ResourceExtractor = CatalogBuildable &
  Readonly<{
    resourceItemIds: readonly string[];
  }>;

export type ProductionItem = Readonly<{
  form: "gas" | "liquid" | "solid";
  id: string;
  imageUrl: string;
  name: string;
}>;

export type ProductionMaterial = Readonly<{
  amount: number;
  itemId: string;
  ratePerMinute: number;
}>;

export type ProductionRecipe = Readonly<{
  alternate: boolean;
  durationSeconds: number;
  id: string;
  inputs: readonly ProductionMaterial[];
  machineIds: readonly string[];
  name: string;
  outputs: readonly ProductionMaterial[];
  power?: Readonly<{
    maximumMw: number;
    minimumMw: number;
  }>;
}>;

export type NodePickerSelection = Readonly<{
  buildableId: string;
  label: string;
  recipeId?: string;
}>;
