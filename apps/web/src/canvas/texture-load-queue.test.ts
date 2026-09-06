import { describe, expect, it, vi } from "vitest";

import { createTextureLoadQueue } from "./texture-load-queue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("texture load queue", () => {
  it("loads each uncached texture once while it is pending", async () => {
    const loading = deferred();
    const onReady = vi.fn();
    const load = vi.fn(() => loading.promise);
    const queue = createTextureLoadQueue({
      isCached: () => false,
      load,
      onReady,
    });

    queue.request("iron.png");
    queue.request("iron.png");
    queue.request("iron.png");
    expect(load).toHaveBeenCalledTimes(1);

    loading.resolve();
    await loading.promise;
    await Promise.resolve();
    expect(onReady).toHaveBeenCalledWith("iron.png");
  });

  it("skips cached textures and ignores completions after disposal", async () => {
    const loading = deferred();
    const onReady = vi.fn();
    const onDiscard = vi.fn();
    const load = vi.fn(() => loading.promise);
    const queue = createTextureLoadQueue({
      isCached: (imageUrl) => imageUrl === "cached.png",
      load,
      onDiscard,
      onReady,
    });

    queue.request("cached.png");
    queue.request("pending.png");
    queue.dispose();
    loading.resolve();
    await loading.promise;
    await Promise.resolve();

    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith("pending.png");
    expect(onDiscard).toHaveBeenCalledWith("pending.png");
    expect(onReady).not.toHaveBeenCalled();
  });

  it("limits concurrent decoding and starts high-priority images first", async () => {
    const loads = new Map<string, ReturnType<typeof deferred>>();
    const load = vi.fn((imageUrl: string) => {
      const loading = deferred();
      loads.set(imageUrl, loading);
      return loading.promise;
    });
    const queue = createTextureLoadQueue({
      isCached: () => false,
      load,
      maxConcurrent: 2,
      onReady: vi.fn(),
    });

    queue.request("item-1.webp");
    queue.request("item-2.webp");
    queue.request("item-3.webp");
    queue.request("machine.webp", "high");
    expect(load).toHaveBeenCalledTimes(2);

    loads.get("item-1.webp")?.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenNthCalledWith(3, "machine.webp");

    loads.get("item-2.webp")?.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenNthCalledWith(4, "item-3.webp");
  });
});
