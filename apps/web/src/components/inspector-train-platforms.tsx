/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Station-local carriage assignments. */
import { stationRoute } from "@satisfactory-belt/factory-core";
import type { FacilityNode } from "@satisfactory-belt/factory-core";

import { InspectorChoice } from "@/components/inspector-choice";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

export function InspectorTrainPlatforms({
  node,
  editor,
  assets,
}: {
  node: FacilityNode;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const document = editor.history.getSnapshot().state;
  const route = stationRoute(document, node);
  const platforms = document.nodes.flatMap((platform) =>
    platform.kind === "facility" &&
    platform.configuration.type === "freight-platform" &&
    platform.configuration.stationId === node.id
      ? [{ id: platform.id, buildingId: platform.buildingId, ...platform.configuration }]
      : [],
  );
  return (
    <section className="space-y-3" aria-label="Freight car transfers">
      <h3 className="text-xs font-medium text-muted-foreground">Freight car transfers</h3>
      {Array.from({ length: route?.freightCarCount ?? 1 }, (_, index) => {
        const position = index + 1;
        return (
          <InspectorChoice
            key={position}
            label={`Car ${position}`}
            value={platforms.find((platform) => platform.position === position)?.id ?? "none"}
            assets={assets}
            options={[
              { value: "none", label: "No transfer" },
              ...platforms.map((platform, i) => ({
                value: platform.id,
                label: `${i + 1}. ${assets.catalog.buildings![platform.buildingId]!.name}`,
                description: `${platform.mode === "load" ? "Load" : "Unload"}${platform.materialId ? ` · ${assets.catalog.items[platform.materialId]!.name}` : ""}${platform.position && platform.position !== position ? ` · currently car ${platform.position}` : ""}`,
                iconId: assets.catalog.buildings![platform.buildingId]!.iconId,
              })),
            ]}
            onChange={(id) =>
              editor.setPlatformAssignment(node.id, position, id === "none" ? null : id)
            }
          />
        );
      })}
      <p className="text-xs text-muted-foreground">
        Connect freight platforms to the station’s rectangular port, then assign their car numbers
        here. Unassigned cars do not transfer cargo.
      </p>
    </section>
  );
}
