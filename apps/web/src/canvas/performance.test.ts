import { describe, expect, it, vi } from "vitest";

import { createPerformanceSampler } from "./performance";

describe("performance sampler", () => {
  it("reports actual update and render timings during active frames", () => {
    const report = vi.fn();
    const sampler = createPerformanceSampler(report);

    sampler.recordUpdate(2);
    sampler.recordRender(0, 3);
    for (let now = 16; now <= 256; now += 16) {
      sampler.recordUpdate(now === 256 ? 8 : 2);
      sampler.recordRender(now, now === 256 ? 12 : 4);
    }

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith({
      fps: 62.5,
      render: { averageMs: 4.5, p95Ms: 12 },
      update: { averageMs: 2.375, p95Ms: 8 },
    });
  });

  it("does not treat an idle gap as a slow frame", () => {
    const report = vi.fn();
    const sampler = createPerformanceSampler(report);
    sampler.recordRender(0, 2);
    sampler.recordUpdate(3);
    sampler.recordRender(1_000, 4);

    expect(report).toHaveBeenLastCalledWith({
      fps: null,
      render: { averageMs: 4, p95Ms: 4 },
      update: { averageMs: 3, p95Ms: 3 },
    });
  });

  it("starts a fresh sampling window after reset", () => {
    const report = vi.fn();
    const sampler = createPerformanceSampler(report);
    sampler.recordRender(100, 20);
    sampler.reset();
    sampler.recordRender(116, 5);

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith({
      fps: null,
      render: { averageMs: 5, p95Ms: 5 },
      update: { averageMs: 0, p95Ms: 0 },
    });
  });
});
