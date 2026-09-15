import { CanvasController, GRID_SIZE, snapToGrid } from "@satisfactory-belt/canvas-core";
import { EditHistory } from "@satisfactory-belt/edit-history";
import { nodeBounds, resolveFactoryNode } from "@satisfactory-belt/factory-core";
import type { FactoryNode, NodeDisplay } from "@satisfactory-belt/factory-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";

/** The host owns document edits and the workspace-local clipboard. */
export function createFactoryEditor(catalog: GameCatalog, initialNodes: readonly FactoryNode[]) {
  const history = new EditHistory<readonly FactoryNode[]>(initialNodes);
  let displays = new Map<string, NodeDisplay>();
  let previousNodes = new Map<string, FactoryNode>();
  function project(nodes: readonly FactoryNode[]) {
    const nextDisplays = new Map<string, NodeDisplay>();
    for (const node of nodes) {
      const previous = previousNodes.get(node.id);
      // Movement changes document positions, not card content.
      const unchanged = previous && sameConfiguration(previous, node);
      nextDisplays.set(
        node.id,
        unchanged ? displays.get(node.id)! : resolveFactoryNode(node, catalog),
      );
    }
    displays = nextDisplays;
    previousNodes = new Map(nodes.map((node) => [node.id, node]));
    return nodes.map(nodeBounds);
  }
  const items = project(initialNodes);
  const controller = new CanvasController({
    items,
    onMove(moves, context) {
      const positions = new Map(moves.map((move) => [move.id, move]));
      history.update((current) => {
        let changed = false;
        const next = current.map((item) => {
          const position = positions.get(item.id);
          if (!position || (position.x === item.x && position.y === item.y)) return item;
          changed = true;
          return { ...item, x: position.x, y: position.y };
        });
        return changed ? next : current;
      }, context?.group);
    },
  });
  history.subscribe(() => controller.setItems(project(history.getSnapshot().state)));
  function historyCommand(command: "undo" | "redo") {
    controller.cancel();
    const before = history.getSnapshot().state;
    history[command]();
    const after = history.getSnapshot().state;
    if (command === "undo" && after.length > before.length) {
      // Undoing a deletion selects the restored items; movement keeps its selection.
      const previousIds = new Set(before.map((item) => item.id));
      const restored = after.filter((item) => !previousIds.has(item.id));
      if (restored.length) controller.setSelection(new Set(restored.map((item) => item.id)));
    }
  }

  function deleteSelection() {
    const { selection, interaction } = controller.getSnapshot();
    if (interaction !== "idle" || !selection.size) return;
    history.update((current) => {
      const remaining = current.filter((item) => !selection.has(item.id));
      return remaining.length === current.length ? current : remaining;
    });
  }

  let clipboard: readonly FactoryNode[] = [];
  let pasteCount = 0;
  function clipboardCommand(command: "copy" | "paste") {
    const { selection, interaction, gridSnapping } = controller.getSnapshot();
    if (interaction !== "idle") return;
    if (command === "copy") {
      const selected = history.getSnapshot().state.filter((item) => selection.has(item.id));
      if (!selected.length) return;
      // Document items are immutable, so later edits cannot change this snapshot.
      clipboard = selected;
      pasteCount = 0;
      return;
    }
    if (!clipboard.length) return;
    const offset = (pasteCount + 1) * GRID_SIZE;
    const origin = clipboard.reduce(
      (point, item) => ({ x: Math.min(point.x, item.x), y: Math.min(point.y, item.y) }),
      { x: Infinity, y: Infinity },
    );
    // Snap the group's origin with one shared offset to retain its internal spacing.
    const dx = gridSnapping ? snapToGrid(origin.x + offset) - origin.x : offset;
    const dy = gridSnapping ? snapToGrid(origin.y + offset) - origin.y : offset;
    // oxlint-disable-next-line oxc/no-map-spread -- History and clipboard snapshots must stay immutable.
    const pasted = clipboard.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      x: item.x + dx,
      y: item.y + dy,
    }));
    history.update((current) => [...current, ...pasted]);
    pasteCount++;
    controller.setSelection(new Set(pasted.map((item) => item.id)));
  }

  return {
    controller,
    history,
    historyCommand,
    clipboardCommand,
    deleteSelection,
    getDisplay: (id: string) => displays.get(id),
  };
}

function sameConfiguration(a: FactoryNode, b: FactoryNode): boolean {
  if (a.kind === "logistics" || b.kind === "logistics")
    return a.kind === "logistics" && b.kind === "logistics" && a.partId === b.partId;
  if (a.kind !== b.kind || a.machineCount !== b.machineCount) return false;
  if (a.kind === "fixed-producer" && b.kind === "fixed-producer")
    return a.producerId === b.producerId;
  if (a.kind === "extractor" && b.kind === "extractor")
    return (
      a.extractorId === b.extractorId &&
      a.resourceId === b.resourceId &&
      a.clockPercent === b.clockPercent
    );
  return (
    a.kind === "manufacturing" &&
    b.kind === "manufacturing" &&
    a.machineId === b.machineId &&
    a.recipeId === b.recipeId &&
    a.clockPercent === b.clockPercent &&
    a.sloopsUsed === b.sloopsUsed
  );
}
