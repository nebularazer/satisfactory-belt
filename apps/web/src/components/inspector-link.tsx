import { isMaterialTransport, routeTopology } from "@satisfactory-belt/factory-core";
import type { MaterialLink } from "@satisfactory-belt/factory-core";

import { CatalogIcon } from "@/components/catalog-search-details";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

const number = new Intl.NumberFormat("en", { maximumSignificantDigits: 6 });
export function InspectorLink({
  link,
  editor,
  assets,
}: {
  link: MaterialLink;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const port = editor
    .getDisplay(link.output.nodeId)
    ?.ports.find((p) => p.key === link.output.portKey);
  if (port && !isMaterialTransport(port.transport)) {
    const closed = routeTopology(editor.history.getSnapshot().state, link.output.nodeId).closed;
    return (
      <p className="text-xs text-muted-foreground">
        {closed ? "Complete route loop." : "Incomplete route."} Route throughput is not part of Flow
        analysis.
      </p>
    );
  }
  const analysis = editor.getFlowAnalysis();
  const rates = analysis.links.get(link.id) ?? [];
  return (
    <section aria-label="Material flow" className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Abstract material connection. Multiple links share the group's supply; belt and pipe
        capacities do not apply.
      </p>
      {[...editor.getMaterials(link.output)].map((id) => {
        const item = assets.catalog.items[id]!;
        const rate = rates.find((entry) => entry.itemId === id)?.perMinute ?? 0;
        return (
          <div key={id} className="flex items-center gap-2 text-sm">
            <CatalogIcon iconId={item.iconId} assets={assets} size={24} />
            <div>
              <p>{item.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {analysis.status === "feasible" || analysis.status === "infeasible"
                  ? `${number.format(rate)} ${item.unit === "m3" ? "m³" : "items"}/min`
                  : "Rate unavailable"}
              </p>
            </div>
          </div>
        );
      })}
      {analysis.status === "infeasible" && (
        <p className="text-xs text-muted-foreground">
          Planned allocation from configured production. Unmet ingredients can reduce actual output.
        </p>
      )}
      {analysis.status === "feasible" && (
        <p className="text-xs text-muted-foreground">
          One feasible allocation; other distributions may also satisfy the plan.
        </p>
      )}
    </section>
  );
}
