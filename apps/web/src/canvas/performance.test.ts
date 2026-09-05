import { describe, expect, it, vi } from "vitest";

import { createPerformanceSampler } from "./performance";

describe("performance sampler", () => {
  it("reports actual update and render timings during active frames", () => {
    const report = vi.fn();
    const sampler = createPerformanceSampler(report);

    sampler.recordUpdate(2);
    sampler.recordRender(0, 3, 10);
    for (let now = 16; now <= 1_008; now += 16) {
      sampler.recordUpdate(now === 1_008 ? 8 : 2);
      sampler.recordRender(now, now === 1_008 ? 12 : 4, 12);
    }

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith({
      fps: 62.5,
      longTasks: {
        averageMs: 0,
        count: 0,
        maximumMs: 0,
        p95Ms: 0,
        supported: false,
      },
      render: {
        averageMs: 4.126984126984127,
        maximumMs: 12,
        p95Ms: 4,
      },
      update: {
        averageMs: 2.0952380952380953,
        maximumMs: 8,
        p95Ms: 2,
      },
      visibleNodes: 12,
    });
  });

  it("does not treat an idle gap as a slow frame", () => {
    const report = vi.fn();
    const sampler = createPerformanceSampler(report);
    sampler.recordRender(0, 2);
    sampler.recordUpdate(3);
    sampler.recordRender(1_000, 4);

    expect(report).toHaveBeenLastCalledWith({
      fps: 0,
      longTasks: {
        averageMs: 0,
        count: 0,
        maximumMs: 0,
        p95Ms: 0,
        supported: false,
      },
      render: { averageMs: 4, maximumMs: 4, p95Ms: 4 },
      update: { averageMs: 3, maximumMs: 3, p95Ms: 3 },
      visibleNodes: 0,
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
      fps: 0,
      longTasks: {
        averageMs: 0,
        count: 0,
        maximumMs: 0,
        p95Ms: 0,
        supported: false,
      },
      render: { averageMs: 5, maximumMs: 5, p95Ms: 5 },
      update: { averageMs: 0, maximumMs: 0, p95Ms: 0 },
      visibleNodes: 0,
    });
  });

  it("reports browser long tasks immediately when supported", () => {
    const report = vi.fn();
    const sampler = createPerformanceSampler(report, true);
    sampler.recordRender(0, 2, 5);
    sampler.recordLongTasks([75, 120]);

    expect(report).toHaveBeenLastCalledWith({
      fps: 0,
      longTasks: {
        averageMs: 97.5,
        count: 2,
        maximumMs: 120,
        p95Ms: 120,
        supported: true,
      },
      render: { averageMs: 0, maximumMs: 0, p95Ms: 0 },
      update: { averageMs: 0, maximumMs: 0, p95Ms: 0 },
      visibleNodes: 5,
    });
  });
});
