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

export type ClockSpeedRange = Readonly<{
  maximumPercent: number;
  minimumPercent: number;
}>;

export type ClockedBuildable = Buildable &
  Readonly<{
    basePowerMw: number;
    clockSpeed: ClockSpeedRange &
      Readonly<{
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

export type StandaloneResourceExtractor = ClockedBuildable &
  Readonly<{
    baseRatePerMinute: number;
    resourceItemIds: readonly string[];
    resourceWell?: false;
    usesResourcePurity: boolean;
  }>;

export type ResourceWellExtractor = Buildable &
  Readonly<{
    resourceItemIds: readonly string[];
    resourceWell: true;
  }>;

export type ResourceExtractor =
  | ResourceWellExtractor
  | StandaloneResourceExtractor;

export type ResourceWellPressurizer = ClockedBuildable &
  Readonly<{
    baseRatePerExtractor: number;
    extractorBuildableId: string;
    resourceItemIds: readonly string[];
  }>;

export type Descriptor = Readonly<{
  energyMj?: number;
  form: "gas" | "liquid" | "solid";
  id: string;
  name: string;
  sinkPoints?: number;
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

export type GeneratorFuel = Readonly<{
  byproduct?: Readonly<{
    amountPerFuel: number;
    itemId: string;
  }>;
  itemId: string;
  supplemental?: Readonly<{
    itemId: string;
    ratePerMinute: number;
  }>;
}>;

export type FuelPowerGenerator = Buildable &
  Readonly<{
    clockSpeed: ClockSpeedRange;
    fuels: readonly GeneratorFuel[];
    generatorKind: "fuel";
    powerProductionMw: number;
  }>;

export type GeothermalPowerGenerator = Buildable &
  Readonly<{
    generatorKind: "geothermal";
    powerProductionByPurity: Readonly<Record<ResourcePurity, PowerRange>>;
  }>;

export type PowerGenerator = FuelPowerGenerator | GeothermalPowerGenerator;

export type MaterialConsumer = Buildable &
  Readonly<{
    acceptedForms: readonly Descriptor["form"][];
    basePowerMw: number;
  }>;

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

export type FuelPowerGenerationProductionProcess = Readonly<{
  buildableIds: readonly [string];
  fuelItemId: string;
  generationKind: "fuel";
  id: string;
  inputItemIds: readonly string[];
  kind: "power-generation";
  name: string;
  outputItemIds: readonly string[];
}>;

export type GeothermalPowerGenerationProductionProcess = Readonly<{
  buildableIds: readonly [string];
  generationKind: "geothermal";
  id: string;
  inputItemIds: readonly [];
  kind: "power-generation";
  name: string;
  outputItemIds: readonly [];
}>;

export type PowerGenerationProductionProcess =
  | FuelPowerGenerationProductionProcess
  | GeothermalPowerGenerationProductionProcess;

export type ConsumptionProductionProcess = Readonly<{
  acceptedForms: readonly Descriptor["form"][];
  buildableIds: readonly [string];
  id: string;
  inputItemIds: readonly [];
  kind: "consumption";
  name: string;
  outputItemIds: readonly [];
}>;

export type ResourceWellProductionProcess = Readonly<{
  buildableIds: readonly [string];
  extractorBuildableId: string;
  id: string;
  inputItemIds: readonly [];
  kind: "resource-well";
  name: string;
  outputItemIds: readonly [string];
  resourceItemId: string;
}>;

export type ProductionProcess =
  | ConsumptionProductionProcess
  | ExtractionProductionProcess
  | PowerGenerationProductionProcess
  | ResourceWellProductionProcess
  | RecipeProductionProcess;

export type ResourceWellSatelliteRequest = Readonly<{
  id: string;
  resourcePurity?: ResourcePurity;
}>;

export type ProcessInstanceRequest = Readonly<{
  /** Percentage from 1 through 250. Defaults to 100. */
  clockSpeedPercent?: number;
  id: string;
  /** Valid only for Resource Extractors that use Resource Purity. */
  resourcePurity?: ResourcePurity;
  /** A whole number within the Production Machine's slot capacity. */
  somersloopCount?: number;
  /** Valid only for a Resource Well instance. Defaults to one Normal satellite. */
  satellites?: readonly ResourceWellSatelliteRequest[];
}>;

export type ProcessNodeRequest = Readonly<{
  buildableId: string;
  id: string;
  instances?: readonly ProcessInstanceRequest[];
  /** Optionally binds a Consumption Process to one accepted Descriptor. */
  itemId?: string;
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

export type FuelGeneratorInstanceConfiguration = Readonly<{
  clockSpeedPercent: number;
  id: string;
}>;

export type GeothermalGeneratorInstanceConfiguration = Readonly<{
  id: string;
  resourcePurity: ResourcePurity;
}>;

export type ConsumptionInstanceConfiguration = Readonly<{
  id: string;
}>;

export type ResourceWellSatelliteConfiguration = Readonly<{
  id: string;
  resourcePurity: ResourcePurity;
}>;

export type ResourceWellInstanceConfiguration = Readonly<{
  clockSpeedPercent: number;
  id: string;
  satellites: readonly ResourceWellSatelliteConfiguration[];
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

export type FuelPowerGenerationNodeConfiguration = Readonly<{
  buildableId: string;
  generationKind: "fuel";
  id: string;
  instances: readonly FuelGeneratorInstanceConfiguration[];
  processId: string;
  processKind: "power-generation";
}>;

export type GeothermalPowerGenerationNodeConfiguration = Readonly<{
  buildableId: string;
  generationKind: "geothermal";
  id: string;
  instances: readonly GeothermalGeneratorInstanceConfiguration[];
  processId: string;
  processKind: "power-generation";
}>;

export type PowerGenerationNodeConfiguration =
  | FuelPowerGenerationNodeConfiguration
  | GeothermalPowerGenerationNodeConfiguration;

export type ConsumptionProcessNodeConfiguration = Readonly<{
  buildableId: string;
  id: string;
  instances: readonly ConsumptionInstanceConfiguration[];
  itemId?: string;
  processId: string;
  processKind: "consumption";
}>;

export type ResourceWellProcessNodeConfiguration = Readonly<{
  buildableId: string;
  id: string;
  instances: readonly ResourceWellInstanceConfiguration[];
  processId: string;
  processKind: "resource-well";
}>;

export type ProcessNodeConfiguration =
  | ConsumptionProcessNodeConfiguration
  | ExtractionProcessNodeConfiguration
  | PowerGenerationNodeConfiguration
  | ResourceWellProcessNodeConfiguration
  | RecipeProcessNodeConfiguration;

export type MaterialRate = Readonly<{
  itemId: string;
  ratePerMinute: number;
}>;

export type MaterialPort = Readonly<{
  direction: "bidirectional" | "input" | "output";
  forms: readonly Descriptor["form"][];
  id: string;
  itemId?: string;
  medium: "conveyor" | "drone" | "pipeline" | "rail" | "vehicle";
  purpose?: "fuel";
}>;

export type RouterBuildable = Buildable &
  Readonly<{
    nodeKind: "router";
    ports: readonly MaterialPort[];
  }>;

export type BufferBuildable = Buildable &
  Readonly<{
    capacity:
      | Readonly<{ slots: number; type: "inventory" }>
      | Readonly<{ cubicMetres: number; type: "fluid" }>;
    nodeKind: "buffer";
    ports: readonly MaterialPort[];
  }>;

export type TransportBuildable = Buildable &
  Readonly<{
    basePowerMw: number;
    cargo: Readonly<{
      forms: readonly Descriptor["form"][];
      localInputCount: number;
      localMedium: "conveyor" | "pipeline";
      localOutputCount: number;
      remoteMedium: "drone" | "rail" | "vehicle";
    }>;
    fuelPort: boolean;
    nodeKind: "transport";
  }>;

export type PowerRange = Readonly<{
  maximumMw: number;
  minimumMw: number;
}>;

export type PowerProfile = Readonly<{
  consumed: PowerRange;
  produced: PowerRange;
}>;

export type MaterialProfile =
  | Readonly<{
      kind: "calculated";
      inputs: readonly MaterialRate[];
      outputs: readonly MaterialRate[];
    }>
  | Readonly<{
      kind: "connection-dependent";
    }>;

export type NodeProfile = Readonly<{
  materials: MaterialProfile;
  power: PowerProfile;
}>;

export type MaterialNodeRequest =
  | Readonly<{
      buildableId: string;
      id: string;
      itemId?: string;
      kind: "buffer";
    }>
  | Readonly<{
      buildableId: string;
      id: string;
      itemId?: string;
      kind: "router";
    }>
  | Readonly<{
      buildableId: string;
      id: string;
      itemId?: string;
      kind: "transport";
      mode: "load" | "unload";
    }>;

export type RouterNodeConfiguration = Readonly<{
  buildableId: string;
  id: string;
  itemId?: string;
  kind: "router";
}>;

export type BufferNodeConfiguration = Readonly<{
  buildableId: string;
  id: string;
  itemId?: string;
  kind: "buffer";
}>;

export type TransportNodeConfiguration = Readonly<{
  buildableId: string;
  id: string;
  itemId?: string;
  kind: "transport";
  mode: "load" | "unload";
}>;

export type RouterNode = Readonly<{
  configuration: RouterNodeConfiguration;
  kind: "router";
  ports: readonly MaterialPort[];
  profile: NodeProfile;
}>;

export type BufferNode = Readonly<{
  configuration: BufferNodeConfiguration;
  kind: "buffer";
  ports: readonly MaterialPort[];
  profile: NodeProfile;
}>;

export type TransportNode = Readonly<{
  configuration: TransportNodeConfiguration;
  kind: "transport";
  ports: readonly MaterialPort[];
  profile: NodeProfile;
}>;

export type RecipeProcessNode = Readonly<{
  configuration: RecipeProcessNodeConfiguration;
  kind: "process";
  ports: readonly MaterialPort[];
  profile: NodeProfile;
}>;

export type ExtractionProcessNode = Readonly<{
  configuration: ExtractionProcessNodeConfiguration;
  kind: "process";
  ports: readonly MaterialPort[];
  profile: NodeProfile;
}>;

export type PowerGenerationProcessNode = Readonly<{
  configuration: PowerGenerationNodeConfiguration;
  kind: "process";
  ports: readonly MaterialPort[];
  profile: NodeProfile;
}>;

export type ConsumptionProcessNode = Readonly<{
  configuration: ConsumptionProcessNodeConfiguration;
  kind: "process";
  ports: readonly MaterialPort[];
  profile: NodeProfile;
}>;

export type ResourceWellProcessNode = Readonly<{
  configuration: ResourceWellProcessNodeConfiguration;
  kind: "process";
  ports: readonly MaterialPort[];
  profile: NodeProfile;
}>;

export type ProcessNode =
  | ConsumptionProcessNode
  | ExtractionProcessNode
  | PowerGenerationProcessNode
  | ResourceWellProcessNode
  | RecipeProcessNode;

export type MaterialNode = BufferNode | RouterNode | TransportNode;

export type Node = MaterialNode | ProcessNode;
