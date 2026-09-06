import { describe, expect, it } from "vitest";

import { stableImageScaleTier } from "./image-scale";

describe("responsive canvas image scale", () => {
  it("changes tiers only after crossing the hysteresis band", () => {
    const baseTier = stableImageScaleTier(2);
    expect(baseTier).toBe(0);
    expect(stableImageScaleTier(2.8, baseTier)).toBe(0);

    const largerTier = stableImageScaleTier(3, baseTier);
    expect(largerTier).toBe(1);
    expect(stableImageScaleTier(2.5, largerTier)).toBe(1);
    expect(stableImageScaleTier(2.3, largerTier)).toBe(0);
  });

  it("can cross multiple tiers after a large zoom change", () => {
    expect(stableImageScaleTier(8, 0)).toBe(4);
    expect(stableImageScaleTier(1, 4)).toBe(0);
  });
});
