import { describe, expect, it, vi } from "vitest";

import { createRenderScheduler } from "./render-scheduler";

describe("render scheduler", () => {
  it("coalesces changes into one render per animation frame", () => {
    let callback: FrameRequestCallback | undefined;
    const render = vi.fn();
    const requestFrame = vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 42;
    });
    const scheduler = createRenderScheduler(render, requestFrame, vi.fn());

    scheduler.request();
    scheduler.request();
    expect(requestFrame).toHaveBeenCalledOnce();

    callback?.(16);
    expect(render).toHaveBeenCalledWith(16);

    scheduler.request();
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending render", () => {
    const cancelFrame = vi.fn();
    const scheduler = createRenderScheduler(vi.fn(), () => 42, cancelFrame);

    scheduler.request();
    scheduler.cancel();

    expect(cancelFrame).toHaveBeenCalledWith(42);
  });
});
