type TextureLoadQueueOptions = Readonly<{
  isCached: (imageUrl: string) => boolean;
  load: (imageUrl: string) => Promise<unknown>;
  maxConcurrent?: number;
  onDiscard?: (imageUrl: string) => void;
  onReady: (imageUrl: string) => void;
}>;

export type TextureLoadPriority = "high" | "normal";

export function createTextureLoadQueue({
  isCached,
  load,
  maxConcurrent = 4,
  onDiscard,
  onReady,
}: TextureLoadQueueOptions) {
  const loading = new Set<string>();
  const waiting = new Map<string, TextureLoadPriority>();
  let active = true;

  const startNext = () => {
    if (!active || loading.size >= maxConcurrent) return;
    const next =
      [...waiting].find(([, priority]) => priority === "high") ??
      waiting.entries().next().value;
    if (!next) return;

    const [imageUrl] = next;
    waiting.delete(imageUrl);
    loading.add(imageUrl);
    void load(imageUrl)
      .then(() => {
        loading.delete(imageUrl);
        if (active) onReady(imageUrl);
        else onDiscard?.(imageUrl);
        startNext();
      })
      .catch(() => {
        loading.delete(imageUrl);
        startNext();
      });
    startNext();
  };

  return {
    dispose() {
      active = false;
      loading.clear();
      waiting.clear();
    },
    request(imageUrl: string, priority: TextureLoadPriority = "normal") {
      if (!active || isCached(imageUrl) || loading.has(imageUrl)) return;
      const waitingPriority = waiting.get(imageUrl);
      if (waitingPriority === "high") return;
      waiting.set(imageUrl, priority);
      startNext();
    },
  };
}
