import { findDescriptor } from "@satisfactory-belt/production";
import { Trash2, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  presentDetailedConnections,
  type DetailedCanvasEditor,
} from "@/detailed-canvas/editor";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function DetailedConnectionInspector({
  editor,
}: Readonly<{ editor: DetailedCanvasEditor }>) {
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
    editor.getState,
  );
  const selectedId =
    state.selectedConnectionIds.length === 1
      ? state.selectedConnectionIds[0]
      : undefined;
  const connection = selectedId
    ? state.document.connections.find(({ id }) => id === selectedId)
    : undefined;
  const presentation = selectedId
    ? presentDetailedConnections(state.document, state.analysis).find(
        ({ id }) => id === selectedId,
      )
    : undefined;
  if (!connection || !presentation) return null;

  const tiers = state.document.tiers.filter(
    ({ medium }) => medium === presentation.tier?.medium,
  );
  const total = presentation.descriptorRates.reduce(
    (sum, { ratePerMinute }) => sum + ratePerMinute,
    0,
  );
  const diagnostics = state.analysis.diagnostics.filter(
    ({ connectionId }) => connectionId === connection.id,
  );
  const from = state.document.nodes.find(
    ({ configuration }) => configuration.id === connection.from.nodeId,
  );
  const to = state.document.nodes.find(
    ({ configuration }) => configuration.id === connection.to.nodeId,
  );

  return (
    <aside
      aria-label={`${presentation.kind === "conveyor" ? "Conveyor" : "Pipeline"} details`}
      className="pointer-events-auto absolute right-0 bottom-0 left-0 z-20 flex max-h-[72dvh] flex-col overflow-hidden rounded-t-2xl border border-x-0 border-b-0 border-border bg-card text-card-foreground shadow-2xl lg:top-4 lg:right-4 lg:bottom-auto lg:left-auto lg:max-h-[calc(100dvh-2rem)] lg:w-[22rem] lg:rounded-xl lg:border-x lg:border-b lg:shadow-xl"
    >
      <header className="flex items-start gap-3 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Connection</div>
          <h2 className="font-heading text-base font-semibold capitalize">
            {presentation.kind}
          </h2>
        </div>
        <Button
          aria-label="Close connection details"
          onClick={() => editor.dispatch({ type: "selection.set" })}
          size="icon-lg"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      <div className="space-y-4 overflow-y-auto p-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-muted/35 p-2">
            <div className="text-muted-foreground">Flow</div>
            <div className="font-semibold tabular-nums">
              {numberFormatter.format(total)} / min
            </div>
          </div>
          <div className="rounded-md bg-muted/35 p-2">
            <div className="text-muted-foreground">Utilization</div>
            <div className="font-semibold tabular-nums">
              {numberFormatter.format(presentation.utilization * 100)}%
            </div>
          </div>
        </div>

        <label className="grid gap-1.5 font-medium">
          {presentation.kind === "conveyor" ? "Belt tier" : "Pipe tier"}
          <select
            aria-label={
              presentation.kind === "conveyor" ? "Belt tier" : "Pipe tier"
            }
            className="h-9 rounded-md border border-input bg-transparent px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onChange={(event) =>
              editor.dispatch({
                type: "connection.tier",
                id: connection.id,
                tierId: event.target.value,
              })
            }
            value={presentation.tier?.id ?? ""}
          >
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.id} · {numberFormatter.format(tier.capacityPerMinute)}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-1.5 font-medium">Materials</div>
          <div className="space-y-1">
            {presentation.descriptorRates.map(({ itemId, ratePerMinute }) => (
              <div
                className="flex justify-between rounded-md bg-muted/35 px-2 py-1.5"
                key={itemId}
              >
                <span>{findDescriptor(itemId)?.name ?? itemId}</span>
                <span className="tabular-nums">
                  {numberFormatter.format(ratePerMinute)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md bg-muted/35 p-2">
          {from?.label ?? connection.from.nodeId} →{" "}
          {to?.label ?? connection.to.nodeId}
        </div>

        {diagnostics.map((diagnostic) => (
          <div className="rounded-md bg-amber-500/10 p-2" key={diagnostic.code}>
            {diagnostic.message}
          </div>
        ))}
      </div>

      <footer className="border-t border-border p-3">
        <Button
          className="w-full"
          onClick={() =>
            editor.dispatch({ type: "connection.delete", id: connection.id })
          }
          variant="destructive"
        >
          <Trash2 aria-hidden="true" />
          Disconnect
        </Button>
      </footer>
    </aside>
  );
}
