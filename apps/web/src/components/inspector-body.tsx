/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Only the selected entity's bounded inspector controls are rendered. */
import {
  commonSetting,
  machineCapabilities,
  MAX_MACHINE_COUNT,
  resolveFactoryNode,
  resolveProduction,
  scopedMachines,
} from "@satisfactory-belt/factory-core";
import type { FactoryNode, MaterialRate } from "@satisfactory-belt/factory-core";
import { useState } from "react";

import { CatalogIcon } from "@/components/catalog-search-details";
import { InspectorNumberField } from "@/components/inspector-number-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

type Editor = ReturnType<typeof createFactoryEditor>;
const rateFormat = new Intl.NumberFormat("en", { maximumSignificantDigits: 5 });

export function InspectorBody({
  node,
  editor,
  assets,
}: {
  node: FactoryNode;
  editor: Editor;
  assets: GameAssets;
}) {
  const [selected, setSelected] = useState("all");
  const scope =
    node.kind !== "logistics" && node.machines.some((member) => member.id === selected)
      ? selected
      : "all";
  const members = node.kind === "logistics" ? null : scopedMachines(node, scope);
  const capabilities = node.kind === "logistics" ? null : machineCapabilities(node, assets.catalog);
  const display = resolveFactoryNode(
    node.kind !== "logistics" && members ? { ...node, machines: members } : node,
    assets.catalog,
  );
  const production = resolveProduction(node, assets.catalog, scope);
  // Logistics and sinks have network-dependent streams, not a configured recipe rate.
  const streams = (direction: "input" | "output"): readonly MaterialRate[] => {
    if (node.kind !== "logistics" && node.kind !== "sink")
      return direction === "input" ? production.inputs : production.outputs;
    const ids = new Set(
      display.ports
        .filter((port) => port.direction === direction)
        .flatMap((port) => Array.from(editor.getMaterials({ nodeId: node.id, portKey: port.key }))),
    );
    return [...ids].map((itemId) => ({ itemId, perMinute: null }));
  };
  return (
    <Tabs
      value={scope}
      onValueChange={(value) => {
        if (typeof value === "string") setSelected(value);
      }}
      className="gap-4"
      onKeyDown={(event) => {
        if (
          event.key === "Escape" ||
          ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase()))
        )
          return;
        event.stopPropagation();
      }}
    >
      {node.kind !== "logistics" && (
        <div className="sticky top-0 z-10 overflow-x-auto overflow-y-hidden bg-card px-1 pt-1 pb-2">
          <TabsList
            aria-label="Machine settings scope"
            className="min-w-full justify-start group-data-horizontal/tabs:h-auto"
          >
            <TabsTrigger value="all" className="h-11 flex-none px-3 sm:h-8">
              All
            </TabsTrigger>
            {node.machines.map((member, index) => (
              <TabsTrigger
                key={member.id}
                value={member.id}
                aria-label={`Machine ${index + 1}`}
                className="h-11 min-w-11 flex-none px-3 sm:h-8 sm:min-w-8"
              >
                {index + 1}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      )}
      <TabsContent value={scope} className="space-y-5">
        {node.kind !== "logistics" && members && capabilities && (
          <div className="space-y-3">
            {scope === "all" && (
              <InspectorNumberField
                label="Machine count"
                value={node.machines.length}
                revision={node.machines}
                min={1}
                max={MAX_MACHINE_COUNT}
                integer
                onCommit={(count) => editor.setMachineCount(node.id, count)}
              />
            )}
            {capabilities.clock && (
              <InspectorNumberField
                key={`${scope}:clock`}
                label="Clock speed"
                value={commonSetting(members, "clockPercent")}
                revision={node.machines}
                min={1}
                max={250}
                unit="%"
                onCommit={(value) =>
                  editor.setOperatingSetting(node.id, scope, "clockPercent", value)
                }
              />
            )}
            {capabilities.sloopSlots > 0 && (
              <InspectorNumberField
                key={`${scope}:sloops`}
                label="Sloops per machine"
                value={commonSetting(members, "sloopsUsed")}
                revision={node.machines}
                min={0}
                max={capabilities.sloopSlots}
                integer
                onCommit={(value) =>
                  editor.setOperatingSetting(node.id, scope, "sloopsUsed", value)
                }
              />
            )}
          </div>
        )}
        <section aria-label="Configured material rates" className="space-y-2 border-t pt-4">
          <div className="grid grid-cols-2 gap-4">
            <RateColumn
              title="Inputs"
              rates={streams("input")}
              assets={assets}
              empty={
                node.kind === "logistics" || node.kind === "sink"
                  ? "No known materials"
                  : "No inputs"
              }
            />
            <RateColumn
              title="Outputs"
              rates={streams("output")}
              assets={assets}
              empty={node.kind === "logistics" ? "No known materials" : "No outputs"}
            />
          </div>
          {production.unavailableReason && (
            <p className="text-xs text-muted-foreground">{production.unavailableReason}</p>
          )}
        </section>
        {display.layout === "machine" && (
          <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
            <span>{scope === "all" ? "Total power" : "Power"}</span>
            <span className="tabular-nums">{display.powerLabel}</span>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function RateColumn({
  title,
  rates,
  assets,
  empty,
}: {
  title: string;
  rates: readonly MaterialRate[];
  assets: GameAssets;
  empty: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {rates.length ? (
        <ul className="space-y-3">
          {rates.map((rate) => {
            const item = assets.catalog.items[rate.itemId]!;
            return (
              <li key={rate.itemId} className="flex items-start gap-2">
                <CatalogIcon iconId={item.iconId} assets={assets} size={24} />
                <div className="min-w-0 break-words text-xs">
                  <p>{item.name}</p>
                  <p className="text-muted-foreground tabular-nums">
                    {rate.perMinute === null
                      ? "Rate unavailable"
                      : `${rateFormat.format(rate.perMinute)} ${item.unit === "m3" ? "m³" : "items"}/min`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
