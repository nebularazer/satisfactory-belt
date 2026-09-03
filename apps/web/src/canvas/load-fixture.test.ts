import { describe, expect, it } from "vitest";

import {
  createCanvasLoadFixture,
  LOAD_FIXTURE_LIMIT,
  loadFixtureNodeCount,
} from "./load-fixture";

describe("canvas load fixture", () => {
  it("creates a deterministic centered grid", () => {
    const first = createCanvasLoadFixture(100);
    const second = createCanvasLoadFixture(100);

    expect(first).toEqual(second);
    expect(first.nodes).toHaveLength(100);
    expect(first.nodes[0]).toMatchObject({
      id: "fixture-node-1",
      label: "Node 1",
    });
  });

  it("parses and bounds the development query parameter", () => {
    expect(loadFixtureNodeCount("?nodes=1000")).toBe(1_000);
    expect(loadFixtureNodeCount(`?nodes=${LOAD_FIXTURE_LIMIT + 1}`)).toBe(
      LOAD_FIXTURE_LIMIT,
    );
    expect(loadFixtureNodeCount("?nodes=invalid")).toBe(0);
  });
});
