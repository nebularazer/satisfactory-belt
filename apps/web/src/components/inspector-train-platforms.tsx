/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Station-local platform configuration. */
import { stationRoute } from "@satisfactory-belt/factory-core";
import type { FacilityNode, FreightPlatform } from "@satisfactory-belt/factory-core";

import { InspectorChoice } from "@/components/inspector-choice";
import { InspectorNumberField } from "@/components/inspector-number-field";
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
  const c = node.configuration;
  if (c.type !== "train-station") return null;
  const buildings = Object.values(assets.catalog.buildings!).filter(
    (b) => b.kind === "freight-platform",
  );
  const candidate = (index: number, platform: FreightPlatform | null): FacilityNode => {
    return {
      ...node,
      configuration: {
        ...c,
        platforms: c.platforms.map((entry, i) => (i === index ? platform : entry)),
      },
    };
  };
  const document = editor.history.getSnapshot().state;
  const route = stationRoute(document, node);
  const stationIds = new Set(route?.stops.map((stop) => stop.nodeId));
  return (
    <section className="space-y-4" aria-label="Freight car transfers">
      <h3 className="text-xs font-medium text-muted-foreground">Freight car transfers</h3>
      {route && (
        <InspectorNumberField
          label="Freight cars"
          value={route.freightCarCount ?? 1}
          min={Math.max(
            1,
            ...document.nodes.flatMap((station) =>
              station.kind === "facility" &&
              station.configuration.type === "train-station" &&
              stationIds.has(station.id)
                ? [station.configuration.platforms.findLastIndex(Boolean) + 1]
                : [],
            ),
          )}
          max={100}
          integer
          revision={route}
          onCommit={(freightCarCount) => editor.setRouteSettings({ ...route, freightCarCount })}
        />
      )}
      {c.platforms.map((platform, index) => {
        const building = platform ? assets.catalog.buildings![platform.buildingId]! : null;
        function variant(buildingId: string): FreightPlatform | null {
          if (buildingId === "none") return null;
          return {
            buildingId,
            mode: platform?.mode ?? "load",
            materialId:
              building?.transport === assets.catalog.buildings![buildingId]!.transport
                ? (platform?.materialId ?? null)
                : null,
          };
        }
        return (
          <div key={`car:${index + 1}`} className="space-y-3 border-t pt-3">
            <InspectorChoice
              label={`Car ${index + 1}`}
              value={platform?.buildingId ?? "none"}
              assets={assets}
              options={[
                {
                  value: "none",
                  label: "No transfer",
                  disabled: () => !editor.canReplaceNode(candidate(index, null)),
                },
                ...buildings.map((b) => ({
                  value: b.id,
                  label: b.transport === "pipe" ? "Fluid" : "Freight",
                  iconId: b.iconId,
                  disabled: () => !editor.canReplaceNode(candidate(index, variant(b.id))),
                })),
              ]}
              onChange={(id) => editor.replaceNode(candidate(index, variant(id)))}
            />
            {platform && building && (
              <>
                <InspectorChoice
                  label="Transfer mode"
                  value={platform.mode}
                  options={(["load", "unload"] as const).map((mode) => ({
                    value: mode,
                    label: mode === "load" ? "Load" : "Unload",
                    disabled: () => !editor.canReplaceNode(candidate(index, { ...platform, mode })),
                  }))}
                  onChange={(mode) =>
                    editor.replaceNode(
                      candidate(index, { ...platform, mode: mode === "load" ? "load" : "unload" }),
                    )
                  }
                />
                <InspectorChoice
                  label="Cargo"
                  value={platform.materialId ?? "auto"}
                  assets={assets}
                  options={[
                    { value: "auto", label: "From connections" },
                    ...Object.values(assets.catalog.items)
                      .filter((item) => (item.form === "solid") === (building.transport === "belt"))
                      .map((item) => ({
                        value: item.id,
                        label: item.name,
                        iconId: item.iconId,
                        disabled: () =>
                          !editor.canReplaceNode(
                            candidate(index, { ...platform, materialId: item.id }),
                          ),
                      })),
                  ]}
                  onChange={(id) =>
                    editor.replaceNode(
                      candidate(index, { ...platform, materialId: id === "auto" ? null : id }),
                    )
                  }
                />
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
