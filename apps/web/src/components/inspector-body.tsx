/* oxlint-disable react-perf/jsx-no-jsx-as-prop, react-perf/jsx-no-new-function-as-prop -- Only the selected entity's bounded inspector controls are rendered. */
import {
  formatPlanningNumber,
  isFlowGroup,
  isProductionLocked,
  commonMatrices,
  commonSetting,
  machineCapabilities,
  MAX_MACHINE_COUNT,
  rebalanceFlowGroup,
  resolveProduction,
  scopedMachines,
} from "@satisfactory-belt/factory-core";
import type { FactoryNode, MaterialRate } from "@satisfactory-belt/factory-core";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useId, useState } from "react";

import { CatalogIcon } from "@/components/catalog-search-details";
import { InspectorButtonGroup } from "@/components/inspector-button-group";
import { InspectorConfiguration } from "@/components/inspector-configuration";
import { InspectorFacility, PURITY_OPTIONS } from "@/components/inspector-facility";
import { InspectorFlow } from "@/components/inspector-flow";
import { InspectorFlowClock } from "@/components/inspector-flow-clock";
import { InspectorNumberField } from "@/components/inspector-number-field";
import { InspectorStatistics } from "@/components/inspector-statistics";
import { InspectorSupplyDetails } from "@/components/inspector-supply-details";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

type Editor = ReturnType<typeof createFactoryEditor>;

export function InspectorBody({
  node,
  editor,
  assets,
}: {
  node: FactoryNode;
  editor: Editor;
  assets: GameAssets;
}) {
  const matrixId = useId();
  const [selected, setSelected] = useState("all");
  const scope =
    node.kind !== "logistics" && node.machines.some((member) => member.id === selected)
      ? selected
      : "all";
  const members = node.kind === "logistics" ? null : scopedMachines(node, scope);
  const capabilities = node.kind === "logistics" ? null : machineCapabilities(node, assets.catalog);
  const production = resolveProduction(node, assets.catalog, scope);
  // Production is configured potential; logistics rates come from the planned allocation.
  const networkRates =
    node.kind === "logistics" ||
    node.kind === "sink" ||
    (node.kind === "facility" &&
      ["storage", "depot", "truck-station", "train-station", "drone-port"].includes(
        node.configuration.type,
      ));
  const streams = (direction: "input" | "output"): readonly MaterialRate[] => {
    if (!networkRates) return direction === "input" ? production.inputs : production.outputs;
    const totals = new Map<string, number | null>();
    for (const port of editor.getPorts(node.id)) {
      if (port.direction !== direction) continue;
      for (const rate of editor.getPortFlows(port)) {
        const previous = totals.get(rate.itemId);
        totals.set(
          rate.itemId,
          rate.perMinute === null || previous === null ? null : (previous ?? 0) + rate.perMinute,
        );
      }
    }
    return [...totals].map(([itemId, perMinute]) => ({
      itemId,
      perMinute: scope === "all" ? perMinute : null,
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
      {node.kind !== "logistics" && capabilities?.groupable && (
        <div className="sticky top-0 z-10 bg-card py-1">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-[3px]">
            <TabsList
              aria-label="Machine settings scope"
              className="min-w-0 flex-1 justify-start p-0 group-data-horizontal/tabs:h-auto"
            >
              <TabsTrigger
                value="all"
                className="h-11 flex-none px-3 focus-visible:ring-inset sm:h-8"
              >
                All
              </TabsTrigger>
              <div className="ml-1 flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden border-l border-border pl-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              </div>
            </TabsList>
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
                  title={
                    isProductionLocked(node)
                      ? "Fewer machines, higher clock"
                      : "Remove last machine"
                  }
                  disabled={
                    node.machines.length <= 1 ||
                    (isFlowGroup(node) &&
                      isProductionLocked(node) &&
                      !rebalanceFlowGroup(node, assets.catalog, node.machines.length - 1))
                  }
                  onClick={() => editor.setMachineCount(node.id, node.machines.length - 1)}
                >
                  <MinusIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-8"
                  aria-label="Add machine"
                  title={isProductionLocked(node) ? "More machines, lower clock" : "Add machine"}
                  disabled={
                    node.machines.length >= MAX_MACHINE_COUNT ||
                    (isFlowGroup(node) &&
                      isProductionLocked(node) &&
                      !rebalanceFlowGroup(node, assets.catalog, node.machines.length + 1))
                  }
                  onClick={() => editor.setMachineCount(node.id, node.machines.length + 1)}
                >
                  <PlusIcon />
                </Button>
              </fieldset>
            )}
          </div>
        </div>
      )}
      <TabsContent value={scope} className="space-y-4">
        <InspectorConfiguration node={node} scope={scope} editor={editor} assets={assets} />
        {isFlowGroup(node) && <InspectorFlow node={node} editor={editor} assets={assets} />}
        {node.kind === "facility" && (
          <InspectorFacility node={node} scope={scope} editor={editor} assets={assets} />
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
              {capabilities.purity && node.kind !== "extractor" && (
                <InspectorButtonGroup
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
                <div className="flex min-h-11 items-center justify-between gap-2 sm:min-h-8">
                  <label htmlFor={matrixId} className="text-xs sm:text-sm">
                    Alien Power Matrices
                    {commonMatrices(members) === null && (
                      <span className="ml-1 text-xs text-muted-foreground">· Mixed</span>
                    )}
                  </label>
                  <Switch
                    id={matrixId}
                    checked={commonMatrices(members) === true}
                    onCheckedChange={(checked) => editor.setMatrixSupply(node.id, scope, checked)}
                  />
                </div>
              )}
              {capabilities.clock &&
                (isFlowGroup(node) ? (
                  <InspectorFlowClock node={node} editor={editor} assets={assets} />
                ) : (
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
                ))}
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
        <section
          aria-label={networkRates ? "Planned material flow" : "Configured material rates"}
          className="space-y-2 border-t pt-4"
        >
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
          {networkRates ? (
            <p className="text-xs text-muted-foreground">
              Planned flow from configured production.
            </p>
          ) : (
            production.unavailableReason && (
              <p className="text-xs text-muted-foreground">{production.unavailableReason}</p>
            )
          )}
        </section>
        <InspectorSupplyDetails node={node} editor={editor} assets={assets} />
        <InspectorStatistics node={node} scope={scope} editor={editor} assets={assets} />
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
                      : `${formatPlanningNumber(rate.perMinute)} ${item.unit === "m3" ? "m³" : "items"}/min`}
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
