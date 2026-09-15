import { validateGameData } from "@satisfactory-belt/game-data";
import type { GameCatalog, IconManifest } from "@satisfactory-belt/game-data";

export type GameAssets = { catalog: GameCatalog; icons: IconManifest; baseUrl: string };

export async function loadGameAssets(signal: AbortSignal): Promise<GameAssets> {
  const baseUrl = new URL(`${import.meta.env.BASE_URL}game-data/`, window.location.href).href;
  try {
    const read = async (file: string) => {
      const response = await fetch(new URL(file, baseUrl), { signal });
      if (!response.ok) throw new Error(`Unable to load ${file}.`);
      return response.json();
    };
    const [catalog, icons] = await Promise.all([read("catalog.json"), read("icons.json")]);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    validateGameData(catalog, icons);
    return { catalog, icons, baseUrl };
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Game assets are missing or outdated. Run pnpm assets:prepare, then pnpm assets:stage --input <prepared-directory>. See docs/machine-node-design.md.",
      { cause: error },
    );
  }
}
