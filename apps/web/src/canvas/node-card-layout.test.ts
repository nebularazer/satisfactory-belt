import { describe, expect, it } from "vitest";

import { nodeCardLayout, nodeCardPortY } from "./node-card-layout";

describe("node card layout", () => {
  it.each([
    ["process", 256, 256, true],
    ["transport", 256, 256, true],
    ["buffer", 256, 208, false],
    ["router", 192, 176, false],
  ] as const)(
    "uses the %s card hierarchy",
    (kind, width, height, hasFooter) => {
      expect(nodeCardLayout({ kind })).toEqual({ height, width, hasFooter });
    },
  );

  it.each([
    [{ hasFooter: true, height: 256 }, 1, [128]],
    [{ hasFooter: true, height: 256 }, 2, [112, 144]],
    [{ hasFooter: true, height: 256 }, 3, [96, 128, 160]],
    [{ hasFooter: true, height: 256 }, 4, [80, 112, 144, 176]],
    [{ hasFooter: false, height: 176 }, 1, [112]],
    [{ hasFooter: false, height: 176 }, 2, [96, 128]],
    [{ hasFooter: false, height: 176 }, 3, [80, 112, 144]],
    [{ hasFooter: false, height: 208 }, 1, [128]],
  ] as const)(
    "centers %s layouts with %s half-grid port lanes",
    (layout, count, expected) => {
      expect(
        Array.from({ length: count }, (_, index) =>
          nodeCardPortY(layout, index, count),
        ),
      ).toEqual(expected);
    },
  );
});
