import type { FactoryDocument } from "@satisfactory-belt/factory-core";

import { createModularFrameReference } from "./modular-frame-reference";
import { createRecyclingReference } from "./recycling-reference";

export function createReferencePlans(): FactoryDocument {
  const plans = [createModularFrameReference(), createRecyclingReference()];
  return {
    nodes: plans.flatMap((plan) => plan.nodes),
    links: plans.flatMap((plan) => plan.links),
    externalFlows: plans.flatMap((plan) => plan.externalFlows ?? []),
  };
}
