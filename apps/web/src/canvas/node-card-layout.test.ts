import { describe, expect, it } from "vitest";

import { nodeCardLayout, nodeCardPortY } from "./node-card-layout";

describe("node card layout", () => {
  it.each([
    ["process", 256, 256, true, true],
    ["transport", 256, 256, true, true],
    ["buffer", 256, 208, false, true],
    ["router", 128, 128, false, false],
  ] as const)(
    "uses the %s card hierarchy",
    (kind, width, height, hasFooter, hasHeader) => {
      expect(nodeCardLayout({ kind })).toEqual({
        height,
        width,
        hasFooter,
        hasHeader,
      });
    },
  );

  it.each([
    [{ hasHeader: true, hasFooter: true, height: 256 }, 1, [128]],
    [{ hasHeader: true, hasFooter: true, height: 256 }, 2, [112, 144]],
    [{ hasHeader: true, hasFooter: true, height: 256 }, 3, [96, 128, 160]],
    [{ hasHeader: true, hasFooter: true, height: 256 }, 4, [80, 112, 144, 176]],
    [{ hasHeader: false, hasFooter: false, height: 128 }, 1, [64]],
    [{ hasHeader: false, hasFooter: false, height: 128 }, 2, [48, 80]],
    [{ hasHeader: false, hasFooter: false, height: 128 }, 3, [32, 64, 96]],
    [{ hasHeader: true, hasFooter: false, height: 208 }, 1, [128]],
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
