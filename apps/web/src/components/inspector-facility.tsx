/* oxlint-disable oxc/no-map-spread -- Candidate settings must preserve immutable history snapshots. */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Controls render only for the selected building. */
import { DEFAULT_DEPOT_RESEARCH, DEPOT_SPEEDS, parsePurity } from "@satisfactory-belt/factory-core";
import type { FacilityNode, FacilityConfiguration } from "@satisfactory-belt/factory-core";
import { PROJECT_PHASES } from "@satisfactory-belt/game-data";
import { PlusIcon, MinusIcon } from "lucide-react";

import { CatalogIcon } from "@/components/catalog-search-details";
import { InspectorChoice } from "@/components/inspector-choice";
import { InspectorNumberField } from "@/components/inspector-number-field";
import { InspectorTextField } from "@/components/inspector-text-field";
import { InspectorTransportRoute } from "@/components/inspector-transport-route";
import { Button } from "@/components/ui/button";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

type Editor = ReturnType<typeof createFactoryEditor>;
export const PURITY_OPTIONS = [
  { value: "0.5", label: "Impure" },
  { value: "1", label: "Normal" },
  { value: "2", label: "Pure" },
];
export function InspectorFacility({
  node,
  editor,
  assets,
}: {
  node: FacilityNode;
  editor: Editor;
  assets: GameAssets;
}) {
  const catalog = assets.catalog,
    b = catalog.buildings![node.buildingId]!,
    c = node.configuration;
  const document = editor.history.getSnapshot().state;
  function commit(configuration: FacilityConfiguration) {
    editor.replaceNode({ ...node, configuration });
  }
  function compatible(configuration: FacilityConfiguration) {
    return editor.canReplaceNode({ ...node, configuration });
  }
  const itemOption = (id: string) => ({
    value: id,
    label: catalog.items[id]!.name,
    iconId: catalog.items[id]!.iconId,
  });
  function items(transport: "belt" | "pipe" = b.transport) {
    return Object.values(catalog.items)
      .filter((i) => (i.form === "solid") === (transport === "belt"))
      .map((i) => itemOption(i.id));
  }
  function field(
    label: string,
    value: number,
    min: number,
    max: number,
    onCommit: (value: number) => void,
    integer = false,
    unit?: string,
  ) {
    return (
      <InspectorNumberField
        label={label}
        value={value}
        min={min}
        max={max}
        integer={integer}
        unit={unit}
        revision={node.configuration}
        onCommit={onCommit}
      />
    );
  }
  return (
    <div className="space-y-4">
      {c.type === "generator" && (
        <InspectorChoice
          label="Fuel · shared by all machines"
          value={c.fuelId}
          assets={assets}
          options={b.fuels.map((f) => ({
            ...itemOption(f.itemId),
            disabled: () => !compatible({ ...c, fuelId: f.itemId }),
          }))}
          onChange={(fuelId) => commit({ ...c, fuelId })}
        />
      )}
      {c.type === "well" && (
        <>
          <InspectorChoice
            label="Resource"
            value={c.resourceId}
            assets={assets}
            options={b.resourceIds.map((id) => ({
              ...itemOption(id),
              disabled: () => !compatible({ ...c, resourceId: id }),
            }))}
            onChange={(resourceId) => commit({ ...c, resourceId })}
          />
          <section className="space-y-3" aria-label="Resource well extractors">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Satellite extractors</h3>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Remove last satellite"
                  disabled={c.satellites.length <= 1}
                  onClick={() => commit({ ...c, satellites: c.satellites.slice(0, -1) })}
                >
                  <MinusIcon />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Add satellite"
                  disabled={c.satellites.length >= 10}
                  onClick={() =>
                    commit({
                      ...c,
                      satellites: [
                        ...c.satellites,
                        { id: crypto.randomUUID(), purity: c.satellites.at(-1)!.purity },
                      ],
                    })
                  }
                >
                  <PlusIcon />
                </Button>
              </div>
            </div>
            <InspectorChoice
              label="All satellite purities"
              value={
                c.satellites.every((s) => s.purity === c.satellites[0]!.purity)
                  ? String(c.satellites[0]!.purity)
                  : null
              }
              options={PURITY_OPTIONS}
              onChange={(value) =>
                commit({
                  ...c,
                  satellites: c.satellites.map((s) => ({
                    ...s,
                    purity: parsePurity(Number(value)),
                  })),
                })
              }
            />
            {c.satellites.map((satellite, index) => (
              <InspectorChoice
                key={satellite.id}
                label={`Extractor ${index + 1} purity`}
                value={String(satellite.purity)}
                options={PURITY_OPTIONS}
                onChange={(value) =>
                  commit({
                    ...c,
                    satellites: c.satellites.map((s) =>
                      s.id === satellite.id ? { ...s, purity: parsePurity(Number(value)) } : s,
                    ),
                  })
                }
              />
            ))}
            <p className="text-xs text-muted-foreground">
              All satellite extractors use this pressurizer’s clock. Power is counted once for the
              pressurizer.
            </p>
          </section>
        </>
      )}
      {c.type === "storage" && (
        <InspectorChoice
          label="Storage variant"
          value={b.id}
          assets={assets}
          options={Object.values(catalog.buildings!)
            .filter((option) => option.kind === "storage" && option.transport === b.transport)
            .map((option) => ({
              value: option.id,
              label: option.name,
              iconId: option.iconId,
              disabled: () => !editor.canReplaceNode({ ...node, buildingId: option.id }),
            }))}
          onChange={(buildingId) => editor.replaceNode({ ...node, buildingId })}
        />
      )}
      {c.type === "depot" && (
        <section className="space-y-3" aria-label="Shared depot research">
          <p className="text-xs text-muted-foreground">
            Research applies to every uploader in this plan.
          </p>
          <InspectorChoice
            label="Upload speed"
            value={String(document.depotResearch?.speedLevel ?? 0)}
            options={DEPOT_SPEEDS.map((rate, index) => ({
              value: String(index),
              label: `${rate} items/min per uploader`,
            }))}
            onChange={(value) =>
              editor.setDepotResearch({
                ...(document.depotResearch ?? DEFAULT_DEPOT_RESEARCH),
                speedLevel: Number(value),
              })
            }
          />
          <InspectorChoice
            label="Depot capacity"
            value={String(document.depotResearch?.capacityLevel ?? 0)}
            options={[0, 1, 2, 3, 4].map((level) => ({
              value: String(level),
              label: `${level + 1} ${level === 0 ? "stack" : "stacks"} per item`,
            }))}
            onChange={(value) =>
              editor.setDepotResearch({
                ...(document.depotResearch ?? DEFAULT_DEPOT_RESEARCH),
                capacityLevel: Number(value),
              })
            }
          />
        </section>
      )}
      {"name" in c && (
        <InspectorTextField
          label="Name"
          value={c.name}
          onCommit={(name) => commit({ ...c, name })}
        />
      )}
      {(c.type === "truck-station" || c.type === "freight-platform") && (
        <>
          <InspectorChoice
            label="Building variant"
            value={b.id}
            assets={assets}
            options={Object.values(catalog.buildings!)
              .filter((option) => option.kind === c.type)
              .map((option) => ({
                value: option.id,
                label: option.name,
                iconId: option.iconId,
                disabled: () => !editor.canReplaceNode({ ...node, buildingId: option.id }),
              }))}
            onChange={(buildingId) => editor.replaceNode({ ...node, buildingId })}
          />
          {!b.id.includes("Empty") && (
            <>
              <InspectorChoice
                label="Transfer mode"
                value={c.mode}
                options={[
                  {
                    value: "load",
                    label: "Load",
                    disabled: () => !compatible({ ...c, mode: "load" }),
                  },
                  {
                    value: "unload",
                    label: "Unload",
                    disabled: () => !compatible({ ...c, mode: "unload" }),
                  },
                ]}
                onChange={(mode) => commit({ ...c, mode: mode === "load" ? "load" : "unload" })}
              />
              <InspectorChoice
                label="Cargo"
                value={c.materialId ?? "auto"}
                assets={assets}
                options={[
                  {
                    value: "auto",
                    label: "From connections",
                    disabled: () => !compatible({ ...c, materialId: null }),
                  },
                  ...items().map((option) => ({
                    ...option,
                    disabled: () => !compatible({ ...c, materialId: option.value }),
                  })),
                ]}
                onChange={(id) => commit({ ...c, materialId: id === "auto" ? null : id })}
              />
            </>
          )}
        </>
      )}
      {(c.type === "truck-station" || c.type === "train-station") && (
        <InspectorTransportRoute node={node} editor={editor} assets={assets} />
      )}
      {c.type === "train-station" && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Platforms</h3>
          {document.nodes
            .filter(
              (n): n is FacilityNode =>
                n.kind === "facility" &&
                n.configuration.type === "freight-platform" &&
                n.configuration.stationId === node.id,
            )
            .toSorted(
              (a, other) =>
                (a.configuration.type === "freight-platform" ? a.configuration.position : 0) -
                (other.configuration.type === "freight-platform"
                  ? other.configuration.position
                  : 0),
            )
            .map((platform) => (
              <p key={platform.id} className="text-xs">
                {platform.configuration.type === "freight-platform" &&
                  `${platform.configuration.position}. ${catalog.buildings![platform.buildingId]!.name} · ${platform.configuration.mode}`}
              </p>
            ))}
          <p className="text-xs text-muted-foreground">
            Place freight or empty platforms from the catalog, then assign their station and
            position.
          </p>
        </section>
      )}
      {c.type === "freight-platform" && (
        <>
          <InspectorChoice
            label="Train station"
            value={c.stationId ?? "none"}
            options={[
              { value: "none", label: "Unassigned" },
              ...document.nodes
                .filter(
                  (n): n is FacilityNode =>
                    n.kind === "facility" && n.configuration.type === "train-station",
                )
                .map((n) => ({
                  value: n.id,
                  label: n.configuration.type === "train-station" ? n.configuration.name : n.id,
                  disabled: () => !compatible({ ...c, stationId: n.id }),
                })),
            ]}
            onChange={(id) => commit({ ...c, stationId: id === "none" ? null : id })}
          />
          <InspectorChoice
            label="Platform position"
            value={String(c.position)}
            options={Array.from({ length: 100 }, (_, index) => ({
              value: String(index + 1),
              label: String(index + 1),
              disabled: () => !compatible({ ...c, position: index + 1 }),
            }))}
            onChange={(position) => commit({ ...c, position: Number(position) })}
          />
        </>
      )}
      {c.type === "drone-port" && (
        <>
          <InspectorChoice
            label="Drone"
            value={String(c.hasDrone)}
            options={[
              { value: "true", label: "Drone stationed here" },
              { value: "false", label: "Destination only" },
            ]}
            onChange={(value) => commit({ ...c, hasDrone: value === "true" })}
          />
          <InspectorChoice
            label="Destination"
            value={c.destinationId ?? "none"}
            options={[
              { value: "none", label: "Unassigned" },
              ...document.nodes
                .filter(
                  (n): n is FacilityNode =>
                    n.kind === "facility" &&
                    n.configuration.type === "drone-port" &&
                    n.id !== node.id,
                )
                .map((n) => ({
                  value: n.id,
                  label: n.configuration.type === "drone-port" ? n.configuration.name : n.id,
                  disabled: () => !compatible({ ...c, destinationId: n.id }),
                })),
            ]}
            onChange={(id) => commit({ ...c, destinationId: id === "none" ? null : id })}
          />
          <InspectorChoice
            label="Fuel"
            value={c.fuelId}
            assets={assets}
            options={b.fuels.map((f) => ({
              ...itemOption(f.itemId),
              disabled: () => !compatible({ ...c, fuelId: f.itemId }),
            }))}
            onChange={(fuelId) => commit({ ...c, fuelId })}
          />
          {(["outgoingItemId", "incomingItemId"] as const).map((key) => (
            <InspectorChoice
              key={key}
              label={key === "outgoingItemId" ? "Outgoing cargo" : "Incoming cargo"}
              value={c[key] ?? "auto"}
              assets={assets}
              options={[
                { value: "auto", label: "From connections" },
                ...items().map((option) => ({
                  ...option,
                  disabled: () => !compatible({ ...c, [key]: option.value }),
                })),
              ]}
              onChange={(id) => commit({ ...c, [key]: id === "auto" ? null : id })}
            />
          ))}
          {field(
            "Round trip",
            c.roundTripSeconds,
            1,
            86400,
            (roundTripSeconds) => commit({ ...c, roundTripSeconds }),
            false,
            "s",
          )}
          <p className="text-xs text-muted-foreground">
            Round-trip time is a planning assumption, including docking and waiting. Cargo
            throughput also depends on available loads.
          </p>
        </>
      )}
      {c.type === "space-elevator" && (
        <>
          <InspectorChoice
            label="Project Assembly phase"
            value={String(c.phase)}
            options={PROJECT_PHASES.map((_, i) => ({
              value: String(i + 1),
              label: `Phase ${i + 1}`,
              disabled: () => !compatible({ ...c, phase: i + 1, delivered: {} }),
            }))}
            onChange={(value) => commit({ ...c, phase: Number(value), delivered: {} })}
          />
          <section className="space-y-4" aria-label="Delivery progress">
            {PROJECT_PHASES[c.phase - 1]!.map((requirement) => (
              <div key={requirement.itemId} className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CatalogIcon
                    iconId={catalog.items[requirement.itemId]!.iconId}
                    assets={assets}
                    size={24}
                  />
                  {catalog.items[requirement.itemId]!.name}
                </div>
                {field(
                  "Delivered",
                  c.delivered[requirement.itemId] ?? 0,
                  0,
                  requirement.amount,
                  (value) =>
                    commit({ ...c, delivered: { ...c.delivered, [requirement.itemId]: value } }),
                  true,
                )}
                <p className="text-xs text-muted-foreground">
                  {requirement.amount - (c.delivered[requirement.itemId] ?? 0)} remaining of{" "}
                  {requirement.amount}
                </p>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
