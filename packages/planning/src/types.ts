import type {
  Descriptor,
  NodeConfiguration,
  ResourcePurity,
} from "@satisfactory-belt/production";

export type PlanKind = "basic" | "detailed" | "layout";

export type MaterialEndpoint = Readonly<{
  nodeId: string;
  portId: string;
}>;

export type MaterialLink = Readonly<{
  from: MaterialEndpoint;
  id: string;
  to: MaterialEndpoint;
}>;

export type PlanPosition = Readonly<{ x: number; y: number }>;

export type GenerationProvenance = Readonly<{
  processId?: string;
  requestOutputItemIds: readonly string[];
}>;

export type BasicNode = Readonly<{
  configuration: NodeConfiguration;
  position?: PlanPosition;
  provenance?: GenerationProvenance;
}>;

export type BasicPlan = Readonly<{
  kind: "basic";
  materialLinks: readonly MaterialLink[];
  nodes: readonly BasicNode[];
  version: 1;
}>;

export type DiagnosticSeverity = "error" | "info" | "warning";

export type OperationalDiagnostic = Readonly<{
  code: string;
  connectionId?: string;
  context?: Readonly<Record<string, number | string>>;
  itemId?: string;
  message: string;
  nodeId?: string;
  severity: DiagnosticSeverity;
}>;

export type BasicMaterialNetwork = Readonly<{
  itemId?: string;
  linkIds: readonly string[];
  portKeys: readonly string[];
}>;

export type BasicPlanAnalysis = Readonly<{
  diagnostics: readonly OperationalDiagnostic[];
  linkItemIds: Readonly<Record<string, string | undefined>>;
  networks: readonly BasicMaterialNetwork[];
}>;

export type RequestedOutput = Readonly<{
  itemId: string;
  ratePerMinute: number;
}>;

export type AvailableResource = Readonly<{
  itemId: string;
  maximumRatePerMinute?: number;
}>;

export type PlanningRequest = Readonly<{
  allowedBuildableIds?: readonly string[];
  allowedProcessIds?: readonly string[];
  availableResources?: readonly AvailableResource[];
  outputs: readonly RequestedOutput[];
}>;

export type ProcessActivity = Readonly<{
  activity: number;
  buildableId: string;
  inputs: readonly RequestedOutput[];
  outputs: readonly RequestedOutput[];
  powerConsumedMw: number;
  powerProducedMw: number;
  processId: string;
}>;

export type ExternalResourceRequirement = Readonly<{
  availableRatePerMinute?: number;
  itemId: string;
  ratePerMinute: number;
}>;

export type SteadyStateStatus =
  | "feasible"
  | "infeasible"
  | "underdetermined"
  | "unbounded";

export type SteadyStateSolution = Readonly<{
  activities: readonly ProcessActivity[];
  diagnostics: readonly OperationalDiagnostic[];
  externalResources: readonly ExternalResourceRequirement[];
  requestedOutputs: readonly RequestedOutput[];
  status: SteadyStateStatus;
}>;

export type RoutingRule = Readonly<{
  itemIds: readonly string[];
  outputPortId: string;
  overflow?: boolean;
}>;

export type DetailedNode = Readonly<{
  configuration: NodeConfiguration;
  provenance?: GenerationProvenance;
  routingRules?: readonly RoutingRule[];
}>;

export type ConveyorTier = Readonly<{
  capacityPerMinute: number;
  id: string;
  medium: "conveyor";
}>;

export type PipelineTier = Readonly<{
  capacityPerMinute: number;
  id: string;
  medium: "pipeline";
}>;

export type LogisticsTier = ConveyorTier | PipelineTier;

type PhysicalConnectionBase = Readonly<{
  from: MaterialEndpoint;
  id: string;
  tierId: string;
  to: MaterialEndpoint;
}>;

export type Conveyor = PhysicalConnectionBase & Readonly<{ kind: "conveyor" }>;

export type Pipeline = PhysicalConnectionBase & Readonly<{ kind: "pipeline" }>;

export type PhysicalConnection = Conveyor | Pipeline;

export type DetailedPlan = Readonly<{
  connections: readonly PhysicalConnection[];
  kind: "detailed";
  nodes: readonly DetailedNode[];
  tiers: readonly LogisticsTier[];
  version: 1;
}>;

export type RoutedConnection = Readonly<{
  connectionId: string;
  points: readonly PlanPosition[];
}>;

export type LayoutPlan = Readonly<{
  detailedPlan: DetailedPlan;
  kind: "layout";
  positions: Readonly<Record<string, PlanPosition>>;
  routes: readonly RoutedConnection[];
  version: 1;
}>;

export type ConnectionFlow = Readonly<{
  connectionId: string;
  itemId: string;
  ratePerMinute: number;
}>;

export type ConveyorFlowProfile = Readonly<{
  connectionId: string;
  flows: readonly Readonly<{ itemId: string; ratePerMinute: number }>[];
  totalRatePerMinute: number;
  utilization: number;
}>;

export type DetailedFlowAnalysis = Readonly<{
  connectionFlows: readonly ConnectionFlow[];
  conveyorProfiles: readonly ConveyorFlowProfile[];
  diagnostics: readonly OperationalDiagnostic[];
  machineEfficiency: Readonly<Record<string, number>>;
  networkByConnectionId: Readonly<Record<string, string>>;
}>;

export type BasicGenerationOptions = Readonly<{
  seed?: string;
  spacing?: PlanPosition;
}>;

export type DetailedGenerationOptions = Readonly<{
  allowedTierIds?: readonly string[];
  allowSushiBelts?: boolean;
  seed?: string;
}>;

export type GeneratedBasicPlan = Readonly<{
  plan: BasicPlan;
  solution: SteadyStateSolution;
}>;

export type GeneratedDetailedPlan = Readonly<{
  plan: DetailedPlan;
  solution: SteadyStateSolution;
}>;

export type MachineAllocationOption = Readonly<{
  clockSpeedPercent?: number;
  resourcePurity?: ResourcePurity;
}>;

export type MaterialForm = Descriptor["form"];
