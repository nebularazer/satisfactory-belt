import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { createCanvasEditor } from "@/canvas/editor";
import {
  InfiniteCanvas,
  type InfiniteCanvasHandle,
} from "@/canvas/infinite-canvas";
import type { Viewport } from "@/canvas/viewport";
import { CanvasControls } from "@/components/canvas-controls";
import { CanvasMenu } from "@/components/canvas-menu";

export function App() {
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const editor = useMemo(() => createCanvasEditor(), []);
  const getEditorUiState = useMemo(() => {
    const initialState = editor.getState();
    let cached = {
      canRedo: initialState.canRedo,
      canUndo: initialState.canUndo,
      selectedCount: initialState.selectedIds.length,
      snapToGrid: initialState.snapToGrid,
    };

    return () => {
      const state = editor.getState();
      const selectedCount = state.selectedIds.length;
      if (
        cached.canRedo !== state.canRedo ||
        cached.canUndo !== state.canUndo ||
        cached.selectedCount !== selectedCount ||
        cached.snapToGrid !== state.snapToGrid
      ) {
        cached = {
          canRedo: state.canRedo,
          canUndo: state.canUndo,
          selectedCount,
          snapToGrid: state.snapToGrid,
        };
      }

      return cached;
    };
  }, [editor]);
  const editorState = useSyncExternalStore(
    editor.subscribe,
    getEditorUiState,
    getEditorUiState,
  );
  const [zoom, setZoom] = useState(1);

  const handleViewportChange = useCallback((viewport: Viewport) => {
    setZoom(viewport.zoom);
  }, []);

  const resetView = () => canvasRef.current?.resetView();

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-canvas text-foreground">
      <h1 className="sr-only">Satisfactory Belt canvas</h1>
      <InfiniteCanvas
        editor={editor}
        onViewportChange={handleViewportChange}
        ref={canvasRef}
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-4 top-4">
          <CanvasMenu
            canDelete={editorState.selectedCount > 0}
            canDuplicate={editorState.selectedCount > 0}
            onAddNode={() => canvasRef.current?.addNode()}
            onDelete={() => editor.dispatch({ type: "selection.delete" })}
            onDuplicate={() => editor.dispatch({ type: "selection.duplicate" })}
            onResetView={resetView}
            onSnapToGridChange={(enabled) =>
              editor.dispatch({ type: "settings.snap", enabled })
            }
            snapToGrid={editorState.snapToGrid}
          />
        </div>

        <div className="pointer-events-auto absolute bottom-4 left-4">
          <CanvasControls
            canRedo={editorState.canRedo}
            canUndo={editorState.canUndo}
            onRedo={() => editor.dispatch({ type: "history.redo" })}
            onResetView={resetView}
            onUndo={() => editor.dispatch({ type: "history.undo" })}
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            zoom={zoom}
          />
        </div>
      </div>
    </main>
  );
}
