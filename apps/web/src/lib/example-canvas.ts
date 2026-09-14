import { CanvasController, GRID_SIZE } from "@satisfactory-belt/canvas-core";
import type { CanvasItem } from "@satisfactory-belt/canvas-core";
import { EditHistory } from "@satisfactory-belt/edit-history";

/** The host owns document edits; the canvas supplies movement intents only. */
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
    history[command]();
  }
  return { controller, history, historyCommand };
}
