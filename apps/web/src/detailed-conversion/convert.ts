import {
  analyzeDetailedPlan,
  DEFAULT_LOGISTICS_TIERS,
} from "@satisfactory-belt/planning";
import type { CanvasDocument } from "@/canvas/document";
import { materializeDetailedCanvas } from "@/canvas/editor-mode";

export const conversionStages = [
  "Expanding machines",
  "Building balancers",
  "Checking belts and pipes",
  "Arranging factory",
  "Saving plan",
] as const;
export type ConversionStage = (typeof conversionStages)[number];
export type ConversionSettings = Readonly<{
  conveyorTierId: string;
  pipelineTierId: string;
}>;
export const defaultConversionSettings: ConversionSettings = {
  conveyorTierId: "conveyor-mk1",
  pipelineTierId: "pipeline-mk1",
};

export function convertDetailed(
  document: CanvasDocument,
  settings: ConversionSettings,
  onStage: (stage: ConversionStage) => void,
) {
  const conveyor = DEFAULT_LOGISTICS_TIERS.find(
    (tier) => tier.id === settings.conveyorTierId && tier.medium === "conveyor",
  );
  const pipeline = DEFAULT_LOGISTICS_TIERS.find(
    (tier) => tier.id === settings.pipelineTierId && tier.medium === "pipeline",
  );
  if (!conveyor || !pipeline)
    throw new Error("Choose a valid conveyor and pipeline tier.");
  const tiers = DEFAULT_LOGISTICS_TIERS.filter(
    (tier) =>
      tier.capacityPerMinute <=
      (tier.medium === "conveyor" ? conveyor : pipeline).capacityPerMinute,
  );
  const result = materializeDetailedCanvas(document, { tiers, onStage });
  onStage("Checking belts and pipes");
  const overloaded = analyzeDetailedPlan(result).diagnostics.find(
    (diagnostic) => diagnostic.code === "detailed.connection.overload",
  );
  if (overloaded)
    throw new Error(
      `A connection needs ${Number(Number(overloaded.context?.ratePerMinute).toFixed(4))}/min, above its ${overloaded.context?.capacityPerMinute}/min limit. Choose a faster tier or split production into smaller groups.`,
    );
  // Speed limits constrain generation, not subsequent manual editing.
  return { ...result, tiers: DEFAULT_LOGISTICS_TIERS };
}
