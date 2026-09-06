import {
  analyzeDetailedPlan,
  createDetailedPlan,
} from "@satisfactory-belt/planning";

import type {
  DetailedAnalysisRequest,
  DetailedAnalysisResponse,
} from "./analysis-coordinator";

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<DetailedAnalysisRequest>) => void) | null;
  postMessage: (response: DetailedAnalysisResponse) => void;
};

scope.onmessage = (event) => {
  const { affectedConnectionIds, plan, revision } = event.data;
  try {
    const affected = new Set(affectedConnectionIds);
    const connections = plan.connections.filter(({ id }) => affected.has(id));
    const nodeIds = new Set(
      connections.flatMap(({ from, to }) => [from.nodeId, to.nodeId]),
    );
    const region = createDetailedPlan({
      connections,
      nodes: plan.nodes.filter(({ configuration }) =>
        nodeIds.has(configuration.id),
      ),
      tiers: plan.tiers,
    });
    scope.postMessage({ analysis: analyzeDetailedPlan(region), revision });
  } catch (error) {
    scope.postMessage({
      error:
        error instanceof Error ? error.message : "Detailed analysis failed.",
      revision,
    });
  }
};
