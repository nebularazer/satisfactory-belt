import type { CanvasEditorState, CanvasNode } from "./editor";
import type { Viewport } from "./viewport";

type CanvasVisibilityState = Pick<
  CanvasEditorState,
  "document" | "moveDelta" | "selectedIds"
>;

type ScreenSize = Readonly<{
  height: number;
  width: number;
}>;

const VIEWPORT_OVERSCAN_PIXELS = 192;

export function visibleCanvasNodes(
  state: CanvasVisibilityState,
  viewport: Viewport,
  screen: ScreenSize,
): readonly CanvasNode[] {
  const overscan = VIEWPORT_OVERSCAN_PIXELS / viewport.zoom;
  const left = -viewport.x / viewport.zoom - overscan;
  const top = -viewport.y / viewport.zoom - overscan;
  const right = (screen.width - viewport.x) / viewport.zoom + overscan;
  const bottom = (screen.height - viewport.y) / viewport.zoom + overscan;
  const movingIds = state.moveDelta
    ? new Set(state.selectedIds)
    : undefined;

  return state.document.nodes.filter((node) => {
    const moving = movingIds?.has(node.id);
    const x = node.x + (moving ? state.moveDelta?.x ?? 0 : 0);
    const y = node.y + (moving ? state.moveDelta?.y ?? 0 : 0);

    return (
      x < right &&
      x + node.width > left &&
      y < bottom &&
      y + node.height > top
    );
  });
}
