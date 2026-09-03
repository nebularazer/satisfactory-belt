import type { CanvasEditor } from "./editor";
import type { InfiniteCanvasHandle } from "./infinite-canvas";

export type CanvasBenchmarkResult = Readonly<{
  dragMs: number;
  marqueeMs: number;
  nodeCount: number;
  panMs: number;
  zoomMs: number;
}>;

function measure(canvas: InfiniteCanvasHandle, action: () => void) {
  const startedAt = performance.now();
  action();
  canvas.flushRender();
  return performance.now() - startedAt;
}

export function runCanvasBenchmark(
  editor: CanvasEditor,
  canvas: InfiniteCanvasHandle,
): CanvasBenchmarkResult {
  const document = editor.getState().document;
  const target = document.nodes[Math.floor(document.nodes.length / 2)];

  canvas.fitContent();
  canvas.flushRender();
  const panMs = measure(canvas, () => canvas.panBy({ x: 96, y: 48 }));
  canvas.panBy({ x: -96, y: -48 });
  canvas.flushRender();

  const zoomMs = measure(canvas, () => canvas.zoomIn());
  canvas.zoomOut();
  canvas.flushRender();

  let marqueeMs = 0;
  let dragMs = 0;
  if (target) {
    marqueeMs = measure(canvas, () => {
      editor.dispatch({
        type: "selection.marquee",
        baseIds: [],
        rectangle: {
          height: target.height,
          width: target.width,
          x: target.x,
          y: target.y,
        },
      });
    });
    editor.dispatch({ type: "selection.move.begin" });
    dragMs = measure(canvas, () => {
      editor.dispatch({
        type: "selection.move.update",
        delta: { x: 32, y: 32 },
      });
    });
    editor.dispatch({ type: "selection.move.cancel" });
  }

  editor.dispatch({ type: "selection.clear" });
  canvas.fitContent();
  canvas.flushRender();

  return {
    dragMs,
    marqueeMs,
    nodeCount: document.nodes.length,
    panMs,
    zoomMs,
  };
}
