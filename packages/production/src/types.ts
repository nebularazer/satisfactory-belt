export type BuildableCategory =
  | "architecture"
  | "logistics"
  | "organization"
  | "power"
  | "production"
  | "special"
  | "transport";

export type Buildable = Readonly<{
  category: BuildableCategory;
  id: string;
  name: string;
  searchTerms?: readonly string[];
}>;

export type ClockedBuildable = Buildable &
  Readonly<{
    basePowerMw: number;
    clockSpeed: Readonly<{
      maximumPercent: number;
      minimumPercent: number;
      powerConsumptionExponent: number;
    }>;
  }>;

export type ProductionMachine = ClockedBuildable &
  Readonly<{
    productionAmplification?: Readonly<{
      multiplierPerSomersloop: number;
      powerConsumptionExponent: number;
      somersloopSlots: number;
    }>;
  }>;

export type ResourceExtractor = ClockedBuildable &
  Readonly<{
    baseRatePerMinute: number;
    resourceItemIds: readonly string[];
    usesResourcePurity: boolean;
  }>;

export type Descriptor = Readonly<{
  form: "gas" | "liquid" | "solid";
  id: string;
  name: string;
}>;

export type ProductionMaterial = Readonly<{
  amount: number;
  itemId: string;
  ratePerMinute: number;
}>;

export type Recipe = Readonly<{
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

export type ResourcePurity = "impure" | "normal" | "pure";

export type RecipeProductionProcess = Readonly<{
  buildableIds: readonly string[];
  id: string;
  inputItemIds: readonly string[];
  kind: "recipe";
  name: string;
  outputItemIds: readonly string[];
  recipeId: string;
}>;

export type ExtractionProductionProcess = Readonly<{
  buildableIds: readonly string[];
  id: string;
  inputItemIds: readonly [];
  kind: "extraction";
  name: string;
  outputItemIds: readonly [string];
  resourceItemId: string;
}>;

export type ProductionProcess =
  | ExtractionProductionProcess
  | RecipeProductionProcess;

export type ProcessInstanceRequest = Readonly<{
  /** Percentage from 1 through 250. Defaults to 100. */
  clockSpeedPercent?: number;
  id: string;
  /** Valid only for Resource Extractors that use Resource Purity. */
  resourcePurity?: ResourcePurity;
  /** A whole number within the Production Machine's slot capacity. */
  somersloopCount?: number;
}>;

export type ProcessNodeRequest = Readonly<{
  buildableId: string;
  id: string;
  instances?: readonly ProcessInstanceRequest[];
  processId: string;
}>;

export type MachineInstanceConfiguration = Readonly<{
  clockSpeedPercent: number;
  id: string;
  somersloopCount: number;
}>;

export type ExtractorInstanceConfiguration = Readonly<{
  clockSpeedPercent: number;
  id: string;
  resourcePurity?: ResourcePurity;
}>;

export type RecipeProcessNodeConfiguration = Readonly<{
  buildableId: string;
  id: string;
  instances: readonly MachineInstanceConfiguration[];
  processId: string;
  processKind: "recipe";
}>;

export type ExtractionProcessNodeConfiguration = Readonly<{
  buildableId: string;
  id: string;
  instances: readonly ExtractorInstanceConfiguration[];
  processId: string;
  processKind: "extraction";
}>;

export type ProcessNodeConfiguration =
  | ExtractionProcessNodeConfiguration
  | RecipeProcessNodeConfiguration;

export type MaterialRate = Readonly<{
  itemId: string;
  ratePerMinute: number;
}>;

export type PowerRange = Readonly<{
  maximumMw: number;
  minimumMw: number;
}>;

export type PowerProfile = Readonly<{
  consumed: PowerRange;
  produced: PowerRange;
}>;

export type NodeProfile = Readonly<{
  inputs: readonly MaterialRate[];
  outputs: readonly MaterialRate[];
  power: PowerProfile;
}>;

export type RecipeProcessNode = Readonly<{
  configuration: RecipeProcessNodeConfiguration;
  kind: "process";
  profile: NodeProfile;
}>;

export type ExtractionProcessNode = Readonly<{
  configuration: ExtractionProcessNodeConfiguration;
  kind: "process";
  profile: NodeProfile;
}>;

export type ProcessNode = ExtractionProcessNode | RecipeProcessNode;
