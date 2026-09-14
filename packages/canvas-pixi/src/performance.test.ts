import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { RenderPerformance } from "./performance";

beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("measures render rate and average CPU duration, returning to zero while idle", () => {
  const monitor = new RenderPerformance();
  monitor.setEnabled(true, 4, 10);
  const listener = vi.fn();
  monitor.subscribe(listener);
  monitor.record(2, 5, 10);
  monitor.record(4, 6, 12);
  vi.advanceTimersByTime(249);
  expect(listener).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(monitor.getSnapshot()).toEqual({
    rendersPerSecond: 8,
    cpuMilliseconds: 3,
    visibleItems: 6,
    totalItems: 12,
  });
  vi.advanceTimersByTime(250);
  expect(monitor.getSnapshot()).toEqual({
    rendersPerSecond: 0,
    cpuMilliseconds: 0,
    visibleItems: 6,
    totalItems: 12,
  });
  const idle = monitor.getSnapshot();
  vi.advanceTimersByTime(1000);
  expect(monitor.getSnapshot()).toBe(idle);
  expect(listener).toHaveBeenCalledTimes(2);
  monitor.destroy();
});

it("has no timer or samples while disabled and starts fresh after re-enabling", () => {
  const monitor = new RenderPerformance();
  monitor.record(9, 5, 10);
  expect(vi.getTimerCount()).toBe(0);
  monitor.setEnabled(true, 3, 8);
  monitor.setEnabled(true, 3, 8);
  expect(vi.getTimerCount()).toBe(1);
  monitor.record(100, 3, 8);
  monitor.setEnabled(false);
  expect(vi.getTimerCount()).toBe(0);
  monitor.record(200, 1, 1);
  vi.advanceTimersByTime(5000);
  monitor.setEnabled(true, 2, 9);
  monitor.record(1, 2, 9);
  vi.advanceTimersByTime(250);
  expect(monitor.getSnapshot()).toEqual({
    rendersPerSecond: 4,
    cpuMilliseconds: 1,
    visibleItems: 2,
    totalItems: 9,
  });
  monitor.destroy();
  expect(vi.getTimerCount()).toBe(0);
});

it("uses actual elapsed time when a sampling callback is delayed", () => {
  const monitor = new RenderPerformance();
  monitor.setEnabled(true);
  monitor.record(2, 1, 1);
  vi.spyOn(performance, "now").mockReturnValue(1000);
  vi.advanceTimersByTime(250);
  expect(monitor.getSnapshot().rendersPerSecond).toBe(1);
  monitor.destroy();
});
