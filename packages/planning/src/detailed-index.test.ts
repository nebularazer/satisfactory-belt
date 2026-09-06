import { describe, expect, it } from "vitest";

import {
  createDetailedPlanIndex,
  DEFAULT_LOGISTICS_TIERS,
  type DetailedPlan,
} from "./index";

const INDEX_BUDGET_MS = 250;

describe("Detailed Plan indexes", () => {
  it("finds only the affected connected region", () => {
    const plan = {
      connections: [
        {
          from: { nodeId: "a", portId: "2" },
          id: "ab",
          kind: "pipeline",
          tierId: "pipeline-mk1",
          to: { nodeId: "b", portId: "1" },
        },
        {
          from: { nodeId: "b", portId: "2" },
          id: "bc",
          kind: "pipeline",
          tierId: "pipeline-mk1",
          to: { nodeId: "c", portId: "1" },
        },
        {
          from: { nodeId: "x", portId: "2" },
          id: "xy",
          kind: "pipeline",
          tierId: "pipeline-mk1",
          to: { nodeId: "y", portId: "1" },
        },
      ],
      kind: "detailed",
      nodes: [],
      tiers: DEFAULT_LOGISTICS_TIERS,
      version: 1,
    } as const satisfies DetailedPlan;
    expect(createDetailedPlanIndex(plan).connectedRegion(["ab"])).toEqual([
      "ab",
      "bc",
    ]);
  });

  it("indexes 20,000 connections within the recorded budget", () => {
    const plan: DetailedPlan = {
      connections: Array.from({ length: 20_000 }, (_, index) => ({
        from: { nodeId: `node-${index}`, portId: "output" },
        id: `connection-${index}`,
        kind: "conveyor" as const,
        tierId: "conveyor-mk6",
        to: { nodeId: `node-${index + 1}`, portId: "input" },
      })),
      kind: "detailed",
      nodes: [],
      tiers: DEFAULT_LOGISTICS_TIERS,
      version: 1,
    };
    const startedAt = Date.now();
    const index = createDetailedPlanIndex(plan);
    const elapsed = Date.now() - startedAt;
    expect(index.connectionsForNode("node-10000")).toHaveLength(2);
    expect(elapsed).toBeLessThan(INDEX_BUDGET_MS);
  });
});
