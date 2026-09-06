import { ArrowRight, TriangleAlert, Trash2, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import type { CanvasEditor } from "@/canvas/editor";
import { presentMaterialLinks } from "@/canvas/material-link-presentation";
import { Button } from "@/components/ui/button";

function endpointLabel(nodeLabel: string, portId: string) {
  const port = portId
    .replace(/^(?:input|output):/, "")
    .replace(/^port:/, "Port ");
  return { nodeLabel, port };
}

export function MaterialLinkInspector({
  editor,
}: Readonly<{ editor: CanvasEditor }>) {
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

  const from = endpointLabel(link.from.nodeLabel, link.from.portId);
  const to = endpointLabel(link.to.nodeLabel, link.to.portId);

  return (
    <aside
      aria-label={`Material Link details: ${link.itemName}`}
      className="pointer-events-auto absolute right-0 bottom-0 left-0 z-20 flex max-h-[62dvh] flex-col overflow-hidden rounded-t-2xl border border-x-0 border-b-0 border-border bg-card text-card-foreground shadow-2xl lg:top-4 lg:right-4 lg:bottom-auto lg:left-auto lg:max-h-[calc(100dvh-2rem)] lg:w-[22rem] lg:rounded-xl lg:border-x lg:border-b lg:shadow-xl"
    >
      <header className="flex items-start gap-3 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Material Link</div>
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
        <div className="mb-4 rounded-lg border border-border bg-muted/35 p-3">
          <div className="text-xs text-muted-foreground">Flow</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums">
            {link.ratePerMinute === undefined
              ? "Unresolved"
              : `${link.label} ${link.unit}`}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs">
          <div className="min-w-0 rounded-md bg-muted/35 p-2">
            <div className="truncate font-medium">{from.nodeLabel}</div>
            <div className="truncate text-muted-foreground">{from.port}</div>
          </div>
          <ArrowRight
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          <div className="min-w-0 rounded-md bg-muted/35 p-2 text-right">
            <div className="truncate font-medium">{to.nodeLabel}</div>
            <div className="truncate text-muted-foreground">{to.port}</div>
          </div>
        </div>

        {link.diagnostics.length > 0 && (
          <div className="mt-4 space-y-2" aria-label="Flow diagnostics">
            {link.diagnostics.map((diagnostic) => (
              <div
                className="flex gap-2 rounded-md bg-amber-500/10 p-2 text-xs"
                key={`${diagnostic.code}:${diagnostic.message}`}
              >
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                />
                <span>{diagnostic.message}</span>
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
