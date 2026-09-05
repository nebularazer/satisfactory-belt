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
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("skips cached textures and ignores completions after disposal", async () => {
    const loading = deferred();
    const onReady = vi.fn();
    const load = vi.fn(() => loading.promise);
    const queue = createTextureLoadQueue({
      isCached: (imageUrl) => imageUrl === "cached.png",
      load,
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
    expect(onReady).not.toHaveBeenCalled();
  });
});
