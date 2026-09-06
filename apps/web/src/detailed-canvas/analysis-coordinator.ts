import {
  affectedDetailedRegion,
  type DetailedFlowAnalysis,
  type DetailedPlan,
} from "@satisfactory-belt/planning";

export type DetailedAnalysisRequest = Readonly<{
  affectedConnectionIds: readonly string[];
  plan: DetailedPlan;
  revision: number;
}>;

export type DetailedAnalysisResponse = Readonly<{
  analysis?: DetailedFlowAnalysis;
  error?: string;
  revision: number;
}>;

export type AnalysisWorkerPort = Readonly<{
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<DetailedAnalysisResponse>) => void,
  ) => void;
  postMessage: (request: DetailedAnalysisRequest) => void;
  removeEventListener: (
    type: "message",
    listener: (event: MessageEvent<DetailedAnalysisResponse>) => void,
  ) => void;
  terminate?: () => void;
}>;

export function createDetailedAnalysisCoordinator(
  worker: AnalysisWorkerPort,
  onResult: (response: DetailedAnalysisResponse) => void,
) {
  let latestRevision = 0;
  const receive = (event: MessageEvent<DetailedAnalysisResponse>) => {
    if (event.data.revision !== latestRevision) return;
    onResult(event.data);
  };
  worker.addEventListener("message", receive);
  return {
    analyze(
      plan: DetailedPlan,
      change: Readonly<{
        connectionIds?: readonly string[];
        nodeIds?: readonly string[];
      }> = {},
    ) {
      latestRevision += 1;
      const explicitlyScoped =
        (change.connectionIds?.length ?? 0) > 0 ||
        (change.nodeIds?.length ?? 0) > 0;
      const affectedConnectionIds = explicitlyScoped
        ? affectedDetailedRegion(plan, change)
        : plan.connections.map(({ id }) => id);
      worker.postMessage({
        // A deletion can remove every supplied identity from the new Plan. In
        // that case a full pass is the smallest safe replacement analysis.
        affectedConnectionIds:
          explicitlyScoped && affectedConnectionIds.length === 0
            ? plan.connections.map(({ id }) => id)
            : affectedConnectionIds,
        plan,
        revision: latestRevision,
      });
      return latestRevision;
    },
    dispose() {
      worker.removeEventListener("message", receive);
      worker.terminate?.();
    },
    getRevision: () => latestRevision,
  };
}

export function createDetailedAnalysisWorker() {
  return new Worker(new URL("./analysis.worker.ts", import.meta.url), {
    type: "module",
  });
}
