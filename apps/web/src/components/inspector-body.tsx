/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Only the selected entity's bounded inspector controls are rendered. */
import {
  configuredIncomingRates,
  commonMatrices,
  commonSetting,
  machineCapabilities,
  MAX_MACHINE_COUNT,
  resolveFactoryNode,
  resolveProduction,
  scopedMachines,
} from "@satisfactory-belt/factory-core";
import type { FactoryNode, MaterialRate } from "@satisfactory-belt/factory-core";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { CatalogIcon } from "@/components/catalog-search-details";
import { InspectorChoice } from "@/components/inspector-choice";
import { InspectorConfiguration } from "@/components/inspector-configuration";
import { InspectorFacility, PURITY_OPTIONS } from "@/components/inspector-facility";
import { InspectorNumberField } from "@/components/inspector-number-field";
import { InspectorStatistics } from "@/components/inspector-statistics";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

type Editor = ReturnType<typeof createFactoryEditor>;
const MATRIX_OPTIONS = [
  { value: "false", label: "Not supplied" },
  { value: "true", label: "Supplied · 5/min" },
];
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
  const sinkRates =
    node.kind === "sink"
      ? configuredIncomingRates(editor.history.getSnapshot().state, assets.catalog, node.id)
      : null;
  // Logistics and sinks have network-dependent streams, not a configured recipe rate.
  const streams = (direction: "input" | "output"): readonly MaterialRate[] => {
    if (
      node.kind !== "logistics" &&
      node.kind !== "sink" &&
      !(
        node.kind === "facility" &&
        ["storage", "depot", "truck-station", "freight-platform", "drone-port"].includes(
          node.configuration.type,
        )
      )
    )
      return direction === "input" ? production.inputs : production.outputs;
    const ids = new Set(
      display.ports
        .filter((port) => port.direction === direction)
        .flatMap((port) =>
          port.itemId
            ? [port.itemId]
            : Array.from(editor.getMaterials({ nodeId: node.id, portKey: port.key })),
        ),
    );
    return [...ids].map((itemId) => ({
      itemId,
      perMinute:
        node.kind === "sink" && scope === "all"
          ? (sinkRates?.find((rate) => rate.itemId === itemId)?.perMinute ?? null)
          : null,
    }));
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
        <div className="sticky top-0 z-10 bg-card py-1">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-[3px]">
            <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
              <TabsList
                aria-label="Machine settings scope"
                className="min-w-full justify-start p-0 group-data-horizontal/tabs:h-auto"
              >
                <TabsTrigger
                  value="all"
                  className="h-11 flex-none px-3 focus-visible:ring-inset sm:h-8"
                >
                  All
                </TabsTrigger>
                {node.machines.map((member, index) => (
                  <TabsTrigger
                    key={member.id}
                    value={member.id}
                    aria-label={`Machine ${index + 1}`}
                    className="h-11 min-w-11 flex-none px-3 focus-visible:ring-inset sm:h-8 sm:min-w-8"
                  >
                    {index + 1}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {capabilities?.groupable && (
              <fieldset
                aria-label="Machine count"
                className="flex min-w-0 shrink-0 items-center border-l border-border pl-1"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-8"
                  aria-label="Remove last machine"
                  title="Remove last machine"
                  disabled={node.machines.length <= 1}
                  onClick={() => editor.setMachineCount(node.id, node.machines.length - 1)}
                >
                  <MinusIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-8"
                  aria-label="Add machine"
                  title="Add machine"
                  disabled={node.machines.length >= MAX_MACHINE_COUNT}
                  onClick={() => editor.setMachineCount(node.id, node.machines.length + 1)}
                >
                  <PlusIcon />
                </Button>
              </fieldset>
            )}
          </div>
        </div>
      )}
      <TabsContent value={scope} className="space-y-5">
        <InspectorConfiguration node={node} editor={editor} assets={assets} />
        {node.kind === "facility" && (
          <InspectorFacility node={node} editor={editor} assets={assets} />
        )}

        {node.kind !== "logistics" &&
          members &&
          capabilities &&
          (capabilities.clock ||
            capabilities.sloopSlots > 0 ||
            capabilities.purity ||
            capabilities.load ||
            capabilities.matrices) && (
            <div className="space-y-3">
              {capabilities.purity && (
                <InspectorChoice
                  label="Purity"
                  value={
                    commonSetting(members, "purity") === null
                      ? null
                      : String(commonSetting(members, "purity"))
                  }
                  options={PURITY_OPTIONS}
                  onChange={(value) =>
                    editor.setOperatingSetting(node.id, scope, "purity", Number(value))
                  }
                />
              )}
              {capabilities.load && (
                <InspectorNumberField
                  key={`${scope}:load`}
                  label="Assumed load"
                  value={commonSetting(members, "loadPercent")}
                  revision={node.machines}
                  min={0}
                  max={100}
                  unit="%"
                  onCommit={(value) =>
                    editor.setOperatingSetting(node.id, scope, "loadPercent", value)
                  }
                />
              )}
              {capabilities.matrices && (
                <InspectorChoice
                  label="Alien Power Matrices"
                  value={commonMatrices(members) === null ? null : String(commonMatrices(members))}
                  options={MATRIX_OPTIONS}
                  onChange={(value) => editor.setMatrixSupply(node.id, scope, value === "true")}
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
                  label="Sloops"
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
        <InspectorStatistics node={node} scope={scope} editor={editor} assets={assets} />
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
