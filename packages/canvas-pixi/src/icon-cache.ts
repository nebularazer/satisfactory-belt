import type { IconManifest, IconSize } from "@satisfactory-belt/game-data";
import { ImageSource, Texture } from "pixi.js";

type Entry = { texture?: Texture; bitmap?: ImageBitmap };

/** A canvas owns its textures. Deleting one card never unloads another card's icons. */
export class IconCache {
  private entries = new Map<string, Entry>();
  private abort = new AbortController();
  private manifest: IconManifest;
  private baseUrl: string;
  private invalidate: () => void;

  constructor(manifest: IconManifest, baseUrl: string, invalidate: () => void) {
    this.manifest = manifest;
    this.baseUrl = baseUrl;
    this.invalidate = invalidate;
  }

  get(iconId: string, pixelSize: number): Texture | undefined {
    const variants = this.manifest.icons[iconId]?.variants;
    if (!variants || this.abort.signal.aborted) return undefined;
    const size: IconSize = pixelSize > 128 ? 256 : pixelSize > 64 ? 128 : 64;
    const request = (variantSize: IconSize) => {
      const variant = variants[variantSize];
      let entry = this.entries.get(variant.path);
      if (!entry) {
        entry = {};
        this.entries.set(variant.path, entry);
        void this.load(new URL(variant.path, this.baseUrl).href, entry);
      }
      return entry.texture;
    };
    // Start with small textures, retaining them as fallbacks while a larger one loads.
    const small = request(64);
    return size === 64 || !small ? small : (request(size) ?? small);
  }

  private async load(url: string, entry: Entry) {
    try {
      const response = await fetch(url, { signal: this.abort.signal });
      if (!response.ok) throw new Error(`Icon response ${response.status}.`);
      const bitmap = await createImageBitmap(await response.blob());
      if (this.abort.signal.aborted) {
        bitmap.close();
        return;
      }
      entry.bitmap = bitmap;
      entry.texture = new Texture({
        source: new ImageSource({ resource: bitmap, autoGenerateMipmaps: true }),
      });
      this.invalidate();
    } catch {
      // Keep the entry, so a failed texture is not requested again on every frame.
    }
  }

  destroy() {
    this.abort.abort();
    for (const entry of this.entries.values()) {
      entry.texture?.destroy(true);
      entry.bitmap?.close();
    }
    this.entries.clear();
  }
}
