import type { SearchEntry } from "@satisfactory-belt/game-data/search";

const shortcuts = [
  ["logistics:Build_ConveyorAttachmentSplitter_C", "Splitter"],
  ["logistics:Build_ConveyorAttachmentMerger_C", "Merger"],
  ["logistics:Build_ConveyorAttachmentSplitterSmart_C", "Smart splitter"],
  ["facility:Build_StorageContainerMk1_C", "Storage"],
  ["facility:Build_StorageContainerMk2_C", "Industrial storage"],
  ["facility:Build_PipeStorageTank_C", "Fluid buffer"],
  ["sink:Build_ResourceSink_C", "Sink"],
  ["facility:Build_CentralStorage_C", "Depot"],
] as const;

export type CatalogShortcut = Readonly<{ entry: SearchEntry; label: string }>;

/** Curated order stays independent of search ranking and connection eligibility. */
export function catalogQuickSelection(index: readonly SearchEntry[]): readonly CatalogShortcut[] {
  const entries = new Map(index.map((entry) => [entry.id, entry]));
  return shortcuts.flatMap(([id, label]) => {
    const entry = entries.get(id);
    return entry ? [{ entry, label }] : [];
  });
}
