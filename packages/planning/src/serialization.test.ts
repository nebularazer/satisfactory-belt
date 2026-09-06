import { describe, expect, it } from "vitest";

import {
  createLayoutPlan,
  generateBasicPlan,
  generateDetailedPlan,
  parsePlan,
  serializePlan,
} from "./index";

const request = {
  outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
} as const;

describe("Plan serialization", () => {
  it("round-trips Basic and Detailed Plan Kinds independently", () => {
    const basic = generateBasicPlan(request).plan;
    const detailed = generateDetailedPlan(request).plan;
    expect(parsePlan(serializePlan(basic))).toEqual(basic);
    expect(parsePlan(serializePlan(detailed))).toEqual(detailed);
  });

  it("validates Layout positions and routes against its Detailed Plan", () => {
    const detailed = generateDetailedPlan(request).plan;
    const positions = Object.fromEntries(
      detailed.nodes.map(({ configuration }, index) => [
        configuration.id,
        { x: index * 100, y: 0 },
      ]),
    );
    const layout = createLayoutPlan({ detailedPlan: detailed, positions });
    expect(parsePlan(serializePlan(layout))).toEqual(layout);
    expect(() =>
      createLayoutPlan({ detailedPlan: detailed, positions: {} }),
    ).toThrow("position");
  });
});
