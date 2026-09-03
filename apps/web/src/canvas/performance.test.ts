import { describe, expect, it, vi } from "vitest";

import { createPerformanceSampler } from "./performance";

describe("performance sampler", () => {
  it("reports average FPS and frame time four times per second", () => {
    const report = vi.fn();
    const sampler = createPerformanceSampler(report);

    for (let now = 16; now <= 256; now += 16) {
      sampler.addFrame(now, 16);
    }

    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith({ fps: 62.5, frameTimeMs: 16 });
  });

  it("starts a fresh sampling window after reset", () => {
    const report = vi.fn();
    const sampler = createPerformanceSampler(report);
    sampler.addFrame(100, 20);
    sampler.reset();

    for (let now = 116; now <= 356; now += 16) {
      sampler.addFrame(now, 16);
    }

    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith({ fps: 62.5, frameTimeMs: 16 });
  });
});
