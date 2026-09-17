/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Station-local platform configuration. */
import { stationRoute } from "@satisfactory-belt/factory-core";
import type { FacilityNode, FreightPlatform } from "@satisfactory-belt/factory-core";
import { XIcon } from "lucide-react";

import { InspectorButtonGroup } from "@/components/inspector-button-group";
import { InspectorChoice } from "@/components/inspector-choice";
import { InspectorNumberField } from "@/components/inspector-number-field";
import { InspectorTransferIcon } from "@/components/inspector-transfer-icon";
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
  const buildings = Object.values(assets.catalog.buildings!)
    .filter((b) => b.kind === "freight-platform")
    .toSorted((a, b) => Number(b.transport === "pipe") - Number(a.transport === "pipe"));
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
        const variants = buildings.flatMap((option) =>
          (["load", "unload"] as const).map((mode) => ({
            value: `${option.id}:${mode}`,
            label: `${option.transport === "pipe" ? "Fluid" : "Freight"} · ${mode === "load" ? "Load" : "Unload"}`,
            icon: <InspectorTransferIcon fluid={option.transport === "pipe"} mode={mode} />,
            configuration: {
              buildingId: option.id,
              mode,
              materialId:
                building?.transport === option.transport ? (platform?.materialId ?? null) : null,
            },
          })),
        );
        return (
          <div key={`car:${index + 1}`} className="space-y-3 border-t pt-3">
            <InspectorButtonGroup
              iconOnly
              label={`Car ${index + 1}`}
              value={platform ? `${platform.buildingId}:${platform.mode}` : "none"}
              options={[
                {
                  value: "none",
                  label: "No transfer",
                  icon: <XIcon className="size-4" />,
                  disabled: () => !editor.canReplaceNode(candidate(index, null)),
                },
                ...variants.map((option) => ({
                  value: option.value,
                  label: option.label,
                  icon: option.icon,
                  disabled: () => !editor.canReplaceNode(candidate(index, option.configuration)),
                })),
              ]}
              onChange={(value) =>
                editor.replaceNode(
                  candidate(
                    index,
                    variants.find((option) => option.value === value)?.configuration ?? null,
                  ),
                )
              }
            />
            <InspectorChoice
              inline
              disabled={!platform}
              label="Cargo"
              value={platform?.materialId ?? "auto"}
              assets={assets}
              options={[
                {
                  value: "auto",
                  pinned: true,
                  label: platform ? "From connections" : "No transfer",
                },
                ...(building && platform ? Object.values(assets.catalog.items) : [])
                  .filter((item) => (item.form === "solid") === (building?.transport === "belt"))
                  .map((item) => ({
                    value: item.id,
                    label: item.name,
                    iconId: item.iconId,
                    disabled: () =>
                      !platform ||
                      !editor.canReplaceNode(
                        candidate(index, { ...platform, materialId: item.id }),
                      ),
                  })),
              ]}
              onChange={(id) =>
                platform &&
                editor.replaceNode(
                  candidate(index, { ...platform, materialId: id === "auto" ? null : id }),
                )
              }
            />
          </div>
        );
      })}
    </section>
  );
}
