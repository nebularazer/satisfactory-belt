import { expect, it } from "vitest";
import { graphStages } from "./graph-stages";

it("aligns parallel production stages despite long bypasses", () => {
  const stages = graphStages(
    ["ore", "ingot", "plate", "screw", "rod", "reinforced", "frame"],
    [
      { from: "ore", to: "ingot" },
      { from: "ingot", to: "plate" },
      { from: "ingot", to: "screw" },
      { from: "ingot", to: "rod" },
      { from: "plate", to: "reinforced" },
      { from: "screw", to: "reinforced" },
      { from: "reinforced", to: "frame" },
      { from: "rod", to: "frame" },
    ],
  );
  expect([...stages.values()]).toEqual([0, 1, 2, 2, 2, 3, 4]);
});
it("keeps recycled production cycles finite and supports disconnected stages", () => {
  expect([
    ...graphStages(
      ["oil", "rubber", "plastic", "output", "isolated"],
      [
        { from: "oil", to: "rubber" },
        { from: "rubber", to: "plastic" },
        { from: "plastic", to: "rubber" },
        { from: "plastic", to: "output" },
      ],
    ).values(),
  ]).toEqual([0, 1, 1, 2, 0]);
});
