import {
  ArrowRight,
  CornerDownRight,
  RotateCcw,
  TriangleAlert,
  Trash2,
  X,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { DEFAULT_LOGISTICS_TIERS } from "@satisfactory-belt/planning";

import type { CanvasEditor } from "@/canvas/editor";
import type { CanvasEditorMode } from "@/canvas/editor-mode";
import { MATERIAL_FLOW_PALETTE } from "@/canvas/material-flow-state";
import { presentMaterialLinks } from "@/canvas/material-link-presentation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

function diagnosticMessage(
  diagnostic: ReturnType<
    typeof presentMaterialLinks
  >[number]["diagnostics"][number],
  unit: string,
) {
  const difference = diagnostic.context?.ratePerMinute;
  if (typeof difference !== "number") return diagnostic.message;
  if (diagnostic.code.includes("shortage")) {
    return `Demand exceeds available supply by ${numberFormatter.format(difference)} ${unit}.`;
  }
  if (diagnostic.code.includes("surplus")) {
    return `Supply exceeds connected demand by ${numberFormatter.format(difference)} ${unit}.`;
  }
  return diagnostic.message;
}

export function MaterialLinkInspector({
  editor,
  mode = "basic",
}: Readonly<{ editor: CanvasEditor; mode?: CanvasEditorMode }>) {
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
    editor.getState,
  );
  const selectedId =
    state.selectedLinkIds.length === 1 ? state.selectedLinkIds[0] : undefined;
  const link = selectedId
    ? presentMaterialLinks(state.document).find(({ id }) => id === selectedId)
    : undefined;
  if (!link) return null;
  const documentLink = state.document.materialLinks.find(
    ({ id }) => id === selectedId,
  );
  const logistics = documentLink?.logistics;
  const tiers = logistics
    ? DEFAULT_LOGISTICS_TIERS.filter(({ medium }) => medium === logistics.kind)
    : [];

  const palette = MATERIAL_FLOW_PALETTE[link.state];

  return (
    <aside
      aria-label={`Material Link details: ${link.itemName}`}
      className="pointer-events-auto absolute right-0 bottom-0 left-0 z-20 flex max-h-[62dvh] flex-col overflow-hidden rounded-t-2xl border border-x-0 border-b-0 border-border bg-card text-card-foreground shadow-2xl lg:top-4 lg:right-4 lg:bottom-auto lg:left-auto lg:max-h-[calc(100dvh-2rem)] lg:w-[22rem] lg:rounded-xl lg:border-x lg:border-b lg:shadow-xl"
    >
      <header className="flex items-start gap-3 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {mode === "detailed" && logistics
              ? logistics.kind === "conveyor"
                ? "Conveyor Belt"
                : "Pipeline"
              : "Material Link"}
          </div>
          <h2 className="truncate font-heading text-base font-semibold">
            {link.itemName}
          </h2>
        </div>
        <Button
          aria-label="Close Material Link details"
          onClick={() => editor.dispatch({ type: "selection.clear" })}
          size="icon-lg"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      <div className="overflow-y-auto p-3">
        <div
          className={`mb-3 flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium ${palette.panelClass}`}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${palette.dotClass}`}
          />
          {palette.label}
        </div>

        <div className="mb-4 rounded-lg border border-border bg-muted/35 p-3">
          <div className="text-xs text-muted-foreground">Flow</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums">
            {link.ratePerMinute === undefined
              ? "Unresolved"
              : `${link.label} ${link.unit}`}
          </div>
        </div>

        {mode === "detailed" && logistics && (
          <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border p-3">
            <div>
              <div className="text-xs font-medium">Logistics tier</div>
              <div className="text-[0.625rem] text-muted-foreground">
                Sets the physical throughput limit.
              </div>
            </div>
            <Select
              items={tiers.map((tier) => ({
                label: `${tier.id.replace(/^(?:conveyor|pipeline)-/, "").toUpperCase()} · ${numberFormatter.format(tier.capacityPerMinute)}`,
                value: tier.id,
              }))}
              onValueChange={(tierId) => {
                if (tierId) {
                  editor.dispatch({ type: "link.tier", id: link.id, tierId });
                }
              }}
              value={logistics.tierId}
            >
              <SelectTrigger aria-label="Logistics tier" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {tiers.map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {`${tier.id.replace(/^(?:conveyor|pipeline)-/, "").toUpperCase()} · ${numberFormatter.format(tier.capacityPerMinute)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="mb-4 space-y-2 rounded-lg border border-border p-3">
          <div className="text-xs font-medium">Connection path</div>
          <p className="text-xs text-muted-foreground">
            Drag the square handles to move a segment. Double-click a line to
            add a bend.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() =>
                editor.dispatch({ type: "link.route.bend", id: link.id })
              }
              variant="outline"
            >
              <CornerDownRight aria-hidden="true" />
              Add bend
            </Button>
            <Button
              onClick={() =>
                editor.dispatch({ type: "link.route.reset", id: link.id })
              }
              variant="outline"
              disabled={!documentLink?.route}
            >
              <RotateCcw aria-hidden="true" />
              Reset route
            </Button>
          </div>
          {state.routeEdit?.id === link.id && !state.routeEdit.valid && (
            <p className="text-xs text-destructive" role="status">
              Move the segment clear of the nodes.
            </p>
          )}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs">
          <div className="min-w-0 rounded-md bg-muted/35 p-2">
            <div className="truncate font-medium">{link.from.nodeLabel}</div>
            <div className="truncate text-muted-foreground">
              {link.from.portLabel}
            </div>
          </div>
          <ArrowRight
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          <div className="min-w-0 rounded-md bg-muted/35 p-2 text-right">
            <div className="truncate font-medium">{link.to.nodeLabel}</div>
            <div className="truncate text-muted-foreground">
              {link.to.portLabel}
            </div>
          </div>
        </div>

        {link.diagnostics.length > 0 && (
          <div className="mt-4 space-y-2" aria-label="Flow diagnostics">
            {link.diagnostics.map((diagnostic) => (
              <div
                className={`flex gap-2 rounded-md border p-2 text-xs ${palette.panelClass}`}
                key={`${diagnostic.code}:${diagnostic.message}`}
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-current"
                />
                <span>{diagnosticMessage(diagnostic, link.unit)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-border p-3">
        <Button
          className="w-full"
          onClick={() => editor.dispatch({ type: "link.delete", id: link.id })}
          variant="destructive"
        >
          <Trash2 aria-hidden="true" />
          Disconnect
        </Button>
      </footer>
    </aside>
  );
}
