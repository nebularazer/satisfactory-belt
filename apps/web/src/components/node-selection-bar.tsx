import { CopyPlus, Pencil, Trash2 } from "lucide-react";
import { useSyncExternalStore } from "react";

import type { CanvasEditor } from "@/canvas/editor";
import { Button } from "@/components/ui/button";

export function NodeSelectionBar({
  editor,
  onEdit,
}: Readonly<{ editor: CanvasEditor; onEdit: () => void }>) {
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
    editor.getState,
  );
  const selectedId =
    state.selectedIds.length === 1 ? state.selectedIds[0] : undefined;
  const node = state.document.nodes.find(
    ({ configuration }) => configuration.id === selectedId,
  );
  if (!node || state.moveDelta !== null) return null;

  return (
    <div
      aria-label={`Selected node: ${node.label}`}
      className="pointer-events-auto absolute bottom-16 left-1/2 flex min-h-11 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-xl border border-border bg-card/95 p-1 shadow-lg backdrop-blur-sm lg:hidden"
      role="toolbar"
    >
      <div className="max-w-28 truncate px-2 text-xs font-medium">
        {node.label}
      </div>
      <Button className="h-9" onClick={onEdit} variant="ghost">
        <Pencil aria-hidden="true" />
        Edit
      </Button>
      <Button
        aria-label="Duplicate selected node"
        className="size-9"
        onClick={() => editor.dispatch({ type: "selection.duplicate" })}
        size="icon-lg"
        variant="ghost"
      >
        <CopyPlus aria-hidden="true" />
      </Button>
      <Button
        aria-label="Delete selected node"
        className="size-9"
        onClick={() => editor.dispatch({ type: "selection.delete" })}
        size="icon-lg"
        variant="destructive"
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}
