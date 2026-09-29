import type { PortReference } from "@satisfactory-belt/canvas-core";
import { formatPlanningNumber } from "@satisfactory-belt/factory-core";

import { CatalogIcon } from "@/components/catalog-search-details";
import { DistributionPreviewPrototype } from "@/components/distribution-preview-prototype";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";
import { portConnections } from "@/lib/inspector";

export function InspectorPort({
  port,
  editor,
  assets,
}: {
  port: PortReference;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const display = editor.getDisplay(port.nodeId)?.ports.find((entry) => entry.key === port.portKey);
  if (!display) return null;
  const analysis = editor.getFlowAnalysis();
  const available = analysis.status === "feasible" || analysis.status === "infeasible";
  const materials = [...editor.getMaterials(port)];
  const flows = editor.getPortFlows(port);
  const connections = portConnections(editor, port);
  const rateLabel = (id: string, rate: number) =>
    available
      ? `${formatPlanningNumber(rate)} ${assets.catalog.items[id]?.unit === "m3" ? "m³" : "items"}/min`
      : "Rate unavailable";
  return (
    <div className="space-y-4 text-sm">
      <DistributionPreviewPrototype port={port} editor={editor} assets={assets} />
      <section aria-label="Port flow" className="space-y-2">
        <h3 className="text-xs text-muted-foreground">Actual flow</h3>
        {materials.map((id) => {
          const item = assets.catalog.items[id]!;
          return (
            <div key={id} className="flex items-center gap-2">
              <CatalogIcon iconId={item.iconId} assets={assets} size={24} />
              <span className="min-w-0 flex-1">{item.name}</span>
              <span className="shrink-0 tabular-nums">
                {rateLabel(id, flows.find((flow) => flow.itemId === id)?.perMinute ?? 0)}
              </span>
            </div>
          );
        })}
        {display.outputLimitLabel && (
          <p className="text-xs text-muted-foreground">
            Output limit: {display.outputLimitLabel}/min
          </p>
        )}
      </section>
      <section aria-label="Connected machines" className="space-y-3 border-t pt-4">
        <h3 className="text-xs text-muted-foreground">
          {display.direction === "output" ? "Sends to" : "Receives from"}
        </h3>
        {connections.length === 0 && <p className="text-muted-foreground">No connections</p>}
        {connections.map(({ id, display: machine, rates }) => (
          <div key={id} className="flex items-start gap-2">
            {machine.layout === "machine" && (
              <CatalogIcon iconId={machine.machineIconId} assets={assets} size={32} />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="break-words">{machine.title}</p>
              {machine.layout === "machine" && (
                <p className="text-xs text-muted-foreground">{machine.subtitle}</p>
              )}
              {materials.map((itemId) => (
                <p key={itemId} className="text-xs tabular-nums">
                  {materials.length > 1 && `${assets.catalog.items[itemId]?.name}: `}
                  {rateLabel(itemId, rates.find((rate) => rate.itemId === itemId)?.perMinute ?? 0)}
                </p>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
