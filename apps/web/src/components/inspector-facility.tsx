/* oxlint-disable oxc/no-map-spread -- Candidate settings must preserve immutable history snapshots. */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-array-as-prop -- Controls render only for the selected building. */
import {
  DEFAULT_DEPOT_RESEARCH,
  DEPOT_SPEEDS,
  commonSetting,
  scopedMachines,
} from "@satisfactory-belt/factory-core";
import type { FacilityNode, FacilityConfiguration } from "@satisfactory-belt/factory-core";
import { PROJECT_PHASES } from "@satisfactory-belt/game-data";

import { InspectorChoice } from "@/components/inspector-choice";
import { InspectorNumberField } from "@/components/inspector-number-field";
import { InspectorTrainPlatforms } from "@/components/inspector-train-platforms";
import { InspectorTransportRoute } from "@/components/inspector-transport-route";
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
  scope,
  editor,
  assets,
}: {
  node: FacilityNode;
  scope: string;
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
  return (
    <div className="space-y-4">
      {c.type === "generator" && (
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
          <section className="space-y-3" aria-label="Satellite extractors">
            <h3 className="text-xs font-medium text-muted-foreground">Satellite extractors</h3>
            {(
              [
                ["impureSatellites", "Impure"],
                ["normalSatellites", "Normal"],
                ["pureSatellites", "Pure"],
              ] as const
            ).map(([setting, label]) => {
              const members = scopedMachines(node, scope);
              const max = Math.min(
                ...members.map(
                  (member) =>
                    10 -
                    (member.impureSatellites ?? 0) -
                    (member.normalSatellites ?? 0) -
                    (member.pureSatellites ?? 0) +
                    (member[setting] ?? 0),
                ),
              );
              return (
                <InspectorNumberField
                  key={`${scope}:${setting}`}
                  label={label}
                  value={commonSetting(members, setting)}
                  min={0}
                  max={max}
                  integer
                  revision={node.machines}
                  onCommit={(value) => editor.setOperatingSetting(node.id, scope, setting, value)}
                />
              );
            })}
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
      {c.type === "truck-station" && (
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
      {c.type === "train-station" && (
        <InspectorTrainPlatforms node={node} editor={editor} assets={assets} />
      )}
      {c.type === "truck-station" && (
        <InspectorChoice
          label="Fuel"
          value={c.fuelId ?? "auto"}
          assets={assets}
          options={[
            { value: "auto", label: "From connections" },
            ...Object.values(catalog.items)
              .filter((item) => item.form === "solid" && (item.energyMegajoules ?? 0) > 0)
              .map((item) => ({
                ...itemOption(item.id),
                disabled: () => !compatible({ ...c, fuelId: item.id }),
              })),
          ]}
          onChange={(fuelId) => commit({ ...c, fuelId: fuelId === "auto" ? null : fuelId })}
        />
      )}
      {c.type === "drone-port" && (
        <>
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
        </>
      )}
      {(c.type === "truck-station" || c.type === "train-station" || c.type === "drone-port") && (
        <InspectorTransportRoute node={node} editor={editor} assets={assets} />
      )}
      {c.type === "space-elevator" && (
        <>
          <InspectorChoice
            label="Project Assembly phase"
            value={String(c.phase)}
            options={PROJECT_PHASES.map((_, i) => ({
              value: String(i + 1),
              label: `Phase ${i + 1}`,
              disabled: () => !compatible({ ...c, phase: i + 1 }),
            }))}
            onChange={(value) => commit({ ...c, phase: Number(value) })}
          />
        </>
      )}
    </div>
  );
}
