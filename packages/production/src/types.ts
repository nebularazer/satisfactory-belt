export type Buildable = Readonly<{
  id: string;
  name: string;
  searchTerms?: readonly string[];
}>;

export type ProductionMachine = Buildable &
  Readonly<{
    basePowerMw: number;
  }>;

export type ResourceExtractor = Buildable &
  Readonly<{
    resourceItemIds: readonly string[];
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
