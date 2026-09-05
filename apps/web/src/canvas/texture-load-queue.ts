type TextureLoadQueueOptions = Readonly<{
  isCached: (imageUrl: string) => boolean;
  load: (imageUrl: string) => Promise<unknown>;
  onReady: () => void;
}>;

export function createTextureLoadQueue({
  isCached,
  load,
  onReady,
}: TextureLoadQueueOptions) {
  const pending = new Set<string>();
  let active = true;

  return {
    dispose() {
      active = false;
      pending.clear();
    },
    request(imageUrl: string) {
      if (!active || isCached(imageUrl) || pending.has(imageUrl)) return;
      pending.add(imageUrl);
      void load(imageUrl)
        .then(() => {
          pending.delete(imageUrl);
          if (active) onReady();
        })
        .catch(() => {
          pending.delete(imageUrl);
        });
    },
  };
}
