import { generateDetailedPlan } from "@satisfactory-belt/planning";
import { describe, expect, it, vi } from "vitest";

import {
  createDetailedAnalysisCoordinator,
  type AnalysisWorkerPort,
  type DetailedAnalysisResponse,
} from "./analysis-coordinator";

function fakeWorker() {
  const listeners = new Set<
    (event: MessageEvent<DetailedAnalysisResponse>) => void
  >();
  return {
    port: {
      addEventListener: (_type, listener) => listeners.add(listener),
      postMessage: vi.fn(),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    } satisfies AnalysisWorkerPort,
    respond(response: DetailedAnalysisResponse) {
      for (const listener of listeners) {
        listener(new MessageEvent("message", { data: response }));
      }
    },
  };
}

describe("Detailed analysis coordinator", () => {
  it("tags requests monotonically and ignores stale worker results", () => {
    const plan = generateDetailedPlan({
      outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
    }).plan;
    const worker = fakeWorker();
    const onResult = vi.fn();
    const coordinator = createDetailedAnalysisCoordinator(
      worker.port,
      onResult,
    );
    expect(coordinator.analyze(plan)).toBe(1);
    expect(coordinator.analyze(plan)).toBe(2);
    worker.respond({ error: "stale", revision: 1 });
    worker.respond({ error: "current", revision: 2 });
    expect(onResult).toHaveBeenCalledOnce();
    expect(onResult).toHaveBeenCalledWith({ error: "current", revision: 2 });
  });

  it("falls back to a full pass when a deleted identity is no longer indexed", () => {
    const plan = generateDetailedPlan({
      outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
    }).plan;
    const worker = fakeWorker();
    const coordinator = createDetailedAnalysisCoordinator(worker.port, vi.fn());

    coordinator.analyze(plan, { connectionIds: ["deleted-connection"] });

    expect(worker.port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        affectedConnectionIds: plan.connections.map(({ id }) => id),
      }),
    );
  });
});
