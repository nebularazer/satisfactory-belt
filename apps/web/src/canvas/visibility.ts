import { canvasNodeId, type CanvasDocument, type CanvasNode } from "./document";
import type { Point, Rectangle } from "./geometry";
import type { Viewport } from "./viewport";

type CanvasVisibilityState = Readonly<{
  document: CanvasDocument;
  moveDelta: Point | null;
  selectedIds: readonly string[];
}>;

type ScreenSize = Readonly<{
  height: number;
  width: number;
}>;

const VIEWPORT_OVERSCAN_PIXELS = 192;

export function visibleCanvasNodes(
  state: CanvasVisibilityState,
  viewport: Viewport,
  screen: ScreenSize,
  query: (rectangle: Rectangle) => readonly CanvasNode[],
): readonly CanvasNode[] {
  const overscan = VIEWPORT_OVERSCAN_PIXELS / viewport.zoom;
  const viewportBounds: Rectangle = {
    height: screen.height / viewport.zoom + overscan * 2,
    width: screen.width / viewport.zoom + overscan * 2,
    x: -viewport.x / viewport.zoom - overscan,
    y: -viewport.y / viewport.zoom - overscan,
  };
  const movingIds = state.moveDelta ? new Set(state.selectedIds) : undefined;
  const queryBounds = state.moveDelta
    ? {
        height: viewportBounds.height + Math.abs(state.moveDelta.y),
        width: viewportBounds.width + Math.abs(state.moveDelta.x),
        x: viewportBounds.x - Math.max(state.moveDelta.x, 0),
        y: viewportBounds.y - Math.max(state.moveDelta.y, 0),
      }
    : viewportBounds;

  return query(queryBounds).filter((node) => {
    const moving = movingIds?.has(canvasNodeId(node));
    const x = node.x + (moving ? (state.moveDelta?.x ?? 0) : 0);
    const y = node.y + (moving ? (state.moveDelta?.y ?? 0) : 0);

    return (
      x < viewportBounds.x + viewportBounds.width &&
      x + node.width > viewportBounds.x &&
      y < viewportBounds.y + viewportBounds.height &&
      y + node.height > viewportBounds.y
    );
  });
}
