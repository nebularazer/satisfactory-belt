import { describe, expect, it } from "vitest";

import {
  classifyMaterialFlowState,
  MATERIAL_FLOW_PALETTE,
} from "./material-flow-state";

describe("material flow state", () => {
  it.each([
    [[], true, "balanced"],
    [["basic.network.shortage"], true, "shortage"],
    [["basic.network.surplus"], true, "surplus"],
    [["detailed.connection.overload"], true, "overloaded"],
    [["basic.network.feedback"], true, "unresolved"],
    [[], false, "unresolved"],
  ] as const)("classifies %j as %s", (codes, resolved, expected) => {
    expect(classifyMaterialFlowState(codes, resolved)).toBe(expected);
  });

  it("defines a distinct canvas color for every state in both themes", () => {
    for (const theme of ["dark", "light"] as const) {
      expect(
        new Set(
          Object.values(MATERIAL_FLOW_PALETTE).map(
            ({ canvas }) => canvas[theme],
          ),
        ).size,
      ).toBe(Object.keys(MATERIAL_FLOW_PALETTE).length);
    }
  });
});
