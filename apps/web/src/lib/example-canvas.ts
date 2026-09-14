import { CanvasController, GRID_SIZE, snapToGrid } from "@satisfactory-belt/canvas-core";
import type { CanvasItem } from "@satisfactory-belt/canvas-core";
import { EditHistory } from "@satisfactory-belt/edit-history";

/** The host owns document edits and the workspace-local clipboard. */
export function createExampleCanvas() {
  const items: readonly CanvasItem[] = Array.from({ length: 6 }, (_, index) => ({
    id: `rectangle-${index + 1}`,
    text: `Rectangle ${String(index + 1).padStart(2, "0")}`,
    x: (5 + (index % 3) * 9) * GRID_SIZE,
    y: (5 + Math.floor(index / 3) * 6) * GRID_SIZE,
    width: 7 * GRID_SIZE,
    height: 4 * GRID_SIZE,
  }));
  const history = new EditHistory(items);
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
  history.subscribe(() => controller.setItems(history.getSnapshot().state));
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

  let clipboard: readonly CanvasItem[] = [];
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
    const pasted = clipboard.map((item) => ({
      id: crypto.randomUUID(),
      text: item.text,
      x: item.x + dx,
      y: item.y + dy,
      width: item.width,
      height: item.height,
    }));
    history.update((current) => [...current, ...pasted]);
    pasteCount++;
    controller.setSelection(new Set(pasted.map((item) => item.id)));
  }

  return { controller, history, historyCommand, clipboardCommand, deleteSelection };
}
