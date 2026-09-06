import { describe, expect, it } from "vitest";

import { solveSteadyState } from "./index";

describe("steady-state solver", () => {
  it("solves an acyclic production chain deterministically", () => {
    const request = {
      outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
    } as const;
    const result = solveSteadyState(request);
    const reordered = solveSteadyState({
      outputs: [...request.outputs].reverse(),
    });

    expect(result.status).toBe("feasible");
    expect(result.activities).toEqual(reordered.activities);
    expect(result.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity: 1,
          processId: "Recipe_IronPlate_C",
        }),
        expect.objectContaining({
          activity: 1,
          processId: "Recipe_IngotIron_C",
        }),
      ]),
    );
    expect(
      result.activities.every(
        ({ activity }) => activity >= 0 && Number.isFinite(activity),
      ),
    ).toBe(true);
  });

  it("solves a recycling cycle simultaneously and reports priming", () => {
    const result = solveSteadyState({
      allowedProcessIds: [
        "Recipe_Alternate_Plastic_1_C",
        "Recipe_Alternate_RecycledRubber_C",
      ],
      availableResources: [{ itemId: "Desc_LiquidFuel_C" }],
      outputs: [{ itemId: "Desc_Plastic_C", ratePerMinute: 60 }],
    });

    expect(result.status).toBe("feasible");
    expect(result.activities).toEqual([
      expect.objectContaining({
        activity: 1.333333,
        processId: "Recipe_Alternate_Plastic_1_C",
      }),
      expect.objectContaining({
        activity: 0.666667,
        processId: "Recipe_Alternate_RecycledRubber_C",
      }),
    ]);
    expect(result.externalResources).toEqual([
      expect.objectContaining({
        itemId: "Desc_LiquidFuel_C",
        ratePerMinute: 60,
      }),
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "solver.priming-required" }),
    );
  });

  it("reports an unavailable constrained resource as infeasible", () => {
    const result = solveSteadyState({
      allowedProcessIds: ["Recipe_IronPlate_C"],
      availableResources: [
        { itemId: "Desc_IronIngot_C", maximumRatePerMinute: 10 },
      ],
      outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
    });
    expect(result.status).toBe("infeasible");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "solver.resource.capacity" }),
    );
  });
});
