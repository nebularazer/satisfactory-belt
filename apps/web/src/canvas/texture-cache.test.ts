import { describe, expect, it, vi } from "vitest";

import { createTextureCache } from "./texture-cache";

describe("texture cache", () => {
  it("evicts the least-recently-used unretained texture over budget", () => {
    const cached = new Set(["machine-128.webp", "item-128.webp"]);
    const unload = vi.fn(async (imageUrl: string) => cached.delete(imageUrl));
    const cache = createTextureCache({
      byteBudget: 128 * 128 * 8,
      isCached: (imageUrl) => cached.has(imageUrl),
      unload,
    });

    cache.retain(new Set(["machine-128.webp"]));
    cache.recordLoaded("item-128.webp");

    expect(unload).toHaveBeenCalledWith("item-128.webp");
    expect(unload).not.toHaveBeenCalledWith("machine-128.webp");
  });

  it("unloads tracked textures when disposed", () => {
    const unload = vi.fn(async () => undefined);
    const cache = createTextureCache({
      isCached: () => true,
      unload,
    });
    cache.recordLoaded("item-64.webp");

    cache.dispose();

    expect(unload).toHaveBeenCalledWith("item-64.webp");
  });
});
