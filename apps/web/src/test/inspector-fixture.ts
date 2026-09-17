import type { GameAssets } from "@/lib/game-assets";

export function inspectorAssets(): GameAssets {
  const assets: GameAssets = {
    baseUrl: "http://localhost/game-data/",
    catalog: {
      schemaVersion: 1,
      source: { locale: "en", docsSha256: "" },
      items: {},
      recipes: {},
      machines: {},
      extractors: {},
      logistics: {},
      sinks: {},
      fixedProducers: {},
      buildings: {
        augmenter: {
          id: "augmenter",
          name: "Alien Power Augmenter",
          description: "",
          descriptorId: "augmenter",
          iconId: "augmenter",
          kind: "augmenter",
          powerMegawatts: 500,
          canOverclock: false,
          powerConsumptionExponent: 1,
          transport: "belt",
          capacity: 0,
          fuels: [],
          resourceIds: [],
          baseRate: 0,
          loadFollowing: false,
        },
      },
    },
    icons: { schemaVersion: 1, format: "webp", encoding: "quality90", icons: {} },
  };
  for (const [id, name] of [
    ["iron", "Iron Plate"],
    ["copper", "Copper Sheet"],
    ["Desc_AlienPowerFuel_C", "Alien Power Matrix"],
  ] as const) {
    assets.catalog.items[id] = {
      id: id,
      name: name,
      description: "",
      iconId: id,
      form: "solid",
      unit: "item",
      sinkable: true,
    };
    const variant = {
      path: `${id}.webp`,
      width: 64 as const,
      height: 64 as const,
      bytes: 1,
      sha256: "",
    };
    assets.icons.icons[id] = { id: id, variants: { 64: variant, 128: variant, 256: variant } };
  }
  return assets;
}
