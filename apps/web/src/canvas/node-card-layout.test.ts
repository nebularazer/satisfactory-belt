import { describe, expect, it } from "vitest";

import { nodeCardLayout } from "./node-card-layout";

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
});
