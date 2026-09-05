const DEFAULT_TEXTURE_BUDGET_BYTES = 24 * 1024 * 1024;

type TextureCacheOptions = Readonly<{
  byteBudget?: number;
  isCached: (imageUrl: string) => boolean;
  unload: (imageUrl: string) => Promise<unknown>;
}>;

function estimatedTextureBytes(imageUrl: string) {
  const width = Number(
    imageUrl.match(/-(64|128|256)(?:-[^/?]+)?\.webp(?:\?|$)/)?.[1],
  );
  // Budget for both the decoded source and its RGBA GPU texture.
  return Number.isFinite(width) ? width * width * 8 : 256 * 256 * 8;
}

export function createTextureCache({
  byteBudget = DEFAULT_TEXTURE_BUDGET_BYTES,
  isCached,
  unload,
}: TextureCacheOptions) {
  const entries = new Map<string, { bytes: number; lastUsed: number }>();
  let clock = 0;
  let retained = new Set<string>();

  const prune = () => {
    let totalBytes = [...entries.values()].reduce(
      (total, entry) => total + entry.bytes,
      0,
    );
    if (totalBytes <= byteBudget) return;

    const candidates = [...entries]
      .filter(([imageUrl]) => !retained.has(imageUrl))
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    for (const [imageUrl, entry] of candidates) {
      entries.delete(imageUrl);
      totalBytes -= entry.bytes;
      void unload(imageUrl).catch(() => undefined);
      if (totalBytes <= byteBudget) break;
    }
  };

  return {
    dispose() {
      for (const imageUrl of entries.keys()) {
        void unload(imageUrl).catch(() => undefined);
      }
      entries.clear();
      retained.clear();
    },
    recordLoaded(imageUrl: string) {
      entries.set(imageUrl, {
        bytes: estimatedTextureBytes(imageUrl),
        lastUsed: ++clock,
      });
      prune();
    },
    retain(imageUrls: ReadonlySet<string>) {
      retained = new Set(imageUrls);
      for (const imageUrl of retained) {
        if (!isCached(imageUrl)) continue;
        entries.set(imageUrl, {
          bytes: estimatedTextureBytes(imageUrl),
          lastUsed: ++clock,
        });
      }
      prune();
    },
  };
}
