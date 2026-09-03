import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { createCanvasEditor } from "@/canvas/editor";
import {
  createCanvasLoadFixture,
  loadFixtureNodeCount,
} from "@/canvas/load-fixture";
import {
  InfiniteCanvas,
  type InfiniteCanvasHandle,
} from "@/canvas/infinite-canvas";
import type { CanvasPerformanceMetrics } from "@/canvas/performance";
import type { Point, Viewport } from "@/canvas/viewport";
import { CanvasControls } from "@/components/canvas-controls";
import { CanvasMenu } from "@/components/canvas-menu";
import { NodePicker } from "@/components/node-picker";
import { PerformanceBar } from "@/components/performance-bar";

export function App() {
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const editor = useMemo(() => {
    const fixtureNodeCount = import.meta.env.DEV
      ? loadFixtureNodeCount(window.location.search)
      : 0;
    return createCanvasEditor({
      document: fixtureNodeCount > 0
        ? createCanvasLoadFixture(fixtureNodeCount)
        : undefined,
    });
  }, []);
  const getEditorUiState = useMemo(() => {
    const initialState = editor.getState();
    let cached = {
      canRedo: initialState.canRedo,
      canUndo: initialState.canUndo,
      nodeCount: initialState.document.nodes.length,
      selectedCount: initialState.selectedIds.length,
      snapToGrid: initialState.snapToGrid,
    };

    return () => {
      const state = editor.getState();
      const nodeCount = state.document.nodes.length;
      const selectedCount = state.selectedIds.length;
      if (
        cached.canRedo !== state.canRedo ||
        cached.canUndo !== state.canUndo ||
        cached.nodeCount !== nodeCount ||
        cached.selectedCount !== selectedCount ||
        cached.snapToGrid !== state.snapToGrid
      ) {
        cached = {
          canRedo: state.canRedo,
          canUndo: state.canUndo,
          nodeCount,
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
  const [performanceMetrics, setPerformanceMetrics] =
    useState<CanvasPerformanceMetrics | null>(null);
  const [showPerformance, setShowPerformance] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pendingNode, setPendingNode] = useState<{ at: Point } | null>(null);

  const handleViewportChange = useCallback((viewport: Viewport) => {
    setZoom(viewport.zoom);
  }, []);
  const handlePerformanceMetricsChange = useCallback(
    (metrics: CanvasPerformanceMetrics) => setPerformanceMetrics(metrics),
    [],
  );
  const handleShowPerformanceChange = (enabled: boolean) => {
    setShowPerformance(enabled);
    setPerformanceMetrics(null);
  };

  const resetView = () => canvasRef.current?.resetView();
  const requestNodeAt = useCallback((at: Point) => setPendingNode({ at }), []);

  const addPendingNode = () => {
    if (!pendingNode) return;
    editor.dispatch({ type: "node.create", at: pendingNode.at });
    setPendingNode(null);
  };

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-canvas text-foreground">
      <h1 className="sr-only">Satisfactory Belt canvas</h1>
      <InfiniteCanvas
        editor={editor}
        onPerformanceMetricsChange={handlePerformanceMetricsChange}
        onRequestAddNode={requestNodeAt}
        onViewportChange={handleViewportChange}
        performanceMetricsEnabled={showPerformance}
        ref={canvasRef}
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-4 top-4">
          <CanvasMenu
            canDelete={editorState.selectedCount > 0}
            canDuplicate={editorState.selectedCount > 0}
            onAddNode={() => {
              const center = canvasRef.current?.getViewportCenter();
              if (center) requestNodeAt(center);
            }}
            onDelete={() => editor.dispatch({ type: "selection.delete" })}
            onDuplicate={() => editor.dispatch({ type: "selection.duplicate" })}
            onResetView={resetView}
            onShowPerformanceChange={handleShowPerformanceChange}
            onSnapToGridChange={(enabled) =>
              editor.dispatch({ type: "settings.snap", enabled })
            }
            showPerformance={showPerformance}
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

        {showPerformance && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <PerformanceBar
              metrics={performanceMetrics}
              nodeCount={editorState.nodeCount}
              selectedCount={editorState.selectedCount}
            />
          </div>
        )}
      </div>

      <NodePicker
        onOpenChange={(open) => {
          if (!open) setPendingNode(null);
        }}
        onSelect={addPendingNode}
        open={pendingNode !== null}
      />
    </main>
  );
}
