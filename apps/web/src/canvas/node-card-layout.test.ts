import { describe, expect, it } from "vitest";

import { nodeCardLayout, nodeCardPortY } from "./node-card-layout";

describe("node card layout", () => {
  it.each([
    ["process", 256, 256, true],
    ["transport", 256, 256, true],
    ["buffer", 256, 192, false],
    ["router", 192, 160, false],
  ] as const)(
    "uses the %s card hierarchy",
    (kind, width, height, hasFooter) => {
      expect(nodeCardLayout({ kind })).toEqual({ height, width, hasFooter });
    },
  );

  it.each([
    [256, 1, [128]],
    [256, 2, [96, 160]],
    [256, 3, [96, 128, 160]],
    [256, 4, [64, 96, 160, 192]],
    [160, 1, [96]],
    [160, 2, [64, 128]],
    [160, 3, [64, 96, 128]],
  ] as const)(
    "centers %s px cards with %s grid-aligned port lanes",
    (height, count, expected) => {
      expect(
        Array.from({ length: count }, (_, index) =>
          nodeCardPortY(height, index, count),
        ),
      ).toEqual(expected);
    },
  );
});
