import { useCallback, useRef, useState } from "react";

import {
  InfiniteCanvas,
  type InfiniteCanvasHandle,
} from "@/canvas/infinite-canvas";
import type { Viewport } from "@/canvas/viewport";
import { CanvasControls } from "@/components/canvas-controls";
import { CanvasMenu } from "@/components/canvas-menu";

export function App() {
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const [zoom, setZoom] = useState(1);

  const handleViewportChange = useCallback((viewport: Viewport) => {
    setZoom(viewport.zoom);
  }, []);

  const resetView = () => canvasRef.current?.resetView();

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-canvas text-foreground">
      <h1 className="sr-only">Satisfactory Belt canvas</h1>
      <InfiniteCanvas onViewportChange={handleViewportChange} ref={canvasRef} />

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-4 top-4">
          <CanvasMenu onResetView={resetView} />
        </div>

        <div className="pointer-events-auto absolute bottom-4 left-4">
          <CanvasControls
            canRedo={false}
            canUndo={false}
            onRedo={() => undefined}
            onResetView={resetView}
            onUndo={() => undefined}
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            zoom={zoom}
          />
        </div>
      </div>
    </main>
  );
}
