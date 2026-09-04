import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { toast } from "sonner";

import { runCanvasBenchmark } from "@/canvas/benchmark";
import {
  parseCanvasDocument,
  serializeCanvasDocument,
} from "@/canvas/document-format";
import {
  attachCanvasAutosave,
  createIndexedDbDocumentStorage,
  type CanvasDocumentStorage,
  type SavedCanvasDocument,
} from "@/canvas/document-storage";
import { createCanvasEditor } from "@/canvas/editor";
import type { CanvasDocument } from "@/canvas/document";
import type { Point } from "@/canvas/geometry";
import {
  createCanvasLoadFixture,
  loadFixtureNodeCount,
} from "@/canvas/load-fixture";
import {
  InfiniteCanvas,
  type InfiniteCanvasHandle,
} from "@/canvas/infinite-canvas";
import type { CanvasPerformanceMetrics } from "@/canvas/performance";
import {
  CANVAS_PREFERENCES,
  readBooleanPreference,
  writeBooleanPreference,
} from "@/canvas/preferences";
import type { Viewport } from "@/canvas/viewport";
import { CanvasContextMenu } from "@/components/canvas-context-menu";
import { CanvasControls } from "@/components/canvas-controls";
import { CanvasEmptyState } from "@/components/canvas-empty-state";
import { CanvasMenu } from "@/components/canvas-menu";
import { ManagePlansDialog } from "@/components/manage-plans-dialog";
import type { NodePickerSelection } from "@/components/node-picker";
import { PerformanceBar } from "@/components/performance-bar";
import { SavePlanDialog } from "@/components/save-plan-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";

const loadNodePicker = () => import("@/components/node-picker");
const NodePicker = lazy(async () => ({
  default: (await loadNodePicker()).NodePicker,
}));

function preloadNodePicker() {
  void loadNodePicker();
}

type BootstrapState =
  | { ready: false }
  | {
      activeSave: SavedCanvasDocument | null;
      document?: CanvasDocument;
      ready: true;
    };

type CanvasWorkspaceProps = {
  autosaveEnabled: boolean;
  initialActiveSave: SavedCanvasDocument | null;
  initialDocument?: CanvasDocument;
  storage: CanvasDocumentStorage;
};

function CanvasWorkspace({
  autosaveEnabled,
  initialActiveSave,
  initialDocument,
  storage,
}: CanvasWorkspaceProps) {
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const editor = useMemo(
    () =>
      createCanvasEditor({
        document: initialDocument,
        snapToGrid: readBooleanPreference(CANVAS_PREFERENCES.snapToGrid, true),
      }),
    [initialDocument],
  );
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
  const [showPerformance, setShowPerformance] = useState(() =>
    readBooleanPreference(CANVAS_PREFERENCES.performance, false),
  );
  const [showGridDots, setShowGridDots] = useState(() =>
    readBooleanPreference(CANVAS_PREFERENCES.showGridDots, true),
  );
  const [zoom, setZoom] = useState(1);
  const [pendingNode, setPendingNode] = useState<{ at: Point } | null>(null);
  const [resetCanvasOpen, setResetCanvasOpen] = useState(false);
  const [managePlansOpen, setManagePlansOpen] = useState(false);
  const [savePlanOpen, setSavePlanOpen] = useState(false);
  const [activeSave, setActiveSave] = useState<SavedCanvasDocument | null>(
    initialActiveSave,
  );
  const activeSaveRef = useRef<SavedCanvasDocument | null>(initialActiveSave);
  const selectActiveSave = useCallback((save: SavedCanvasDocument | null) => {
    activeSaveRef.current = save;
    setActiveSave(save);
  }, []);

  useEffect(() => {
    const idleWindow = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
    };
    if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
      const idleCallback = idleWindow.requestIdleCallback(preloadNodePicker, {
        timeout: 1_500,
      });
      return () => idleWindow.cancelIdleCallback?.(idleCallback);
    }
    const timeout = window.setTimeout(preloadNodePicker, 250);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!autosaveEnabled) return;
    return attachCanvasAutosave(
      editor,
      storage,
      () => activeSaveRef.current?.id ?? null,
      300,
      () => {
        toast.error("The plan could not be saved in this browser.");
      },
    );
  }, [autosaveEnabled, editor, storage]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const benchmark = () => {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("The canvas is not ready yet.");
      return runCanvasBenchmark(editor, canvas);
    };
    const benchmarkWindow = window as Window & {
      satisfactoryBeltBenchmark?: typeof benchmark;
    };
    benchmarkWindow.satisfactoryBeltBenchmark = benchmark;
    return () => {
      delete benchmarkWindow.satisfactoryBeltBenchmark;
    };
  }, [editor]);

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
    writeBooleanPreference(CANVAS_PREFERENCES.performance, enabled);
  };
  const handleShowGridDotsChange = (enabled: boolean) => {
    setShowGridDots(enabled);
    writeBooleanPreference(CANVAS_PREFERENCES.showGridDots, enabled);
  };
  const requestNodeAt = useCallback((at: Point) => {
    preloadNodePicker();
    setPendingNode({ at });
  }, []);

  const openSavePlan = useCallback(() => {
    setPendingNode(null);
    setResetCanvasOpen(false);
    setManagePlansOpen(false);
    setSavePlanOpen(true);
  }, []);

  const saveCurrentPlan = useCallback(async () => {
    const current = activeSaveRef.current;
    if (!current) {
      openSavePlan();
      return;
    }

    try {
      const saved = await storage.saveNamed({
        document: editor.getState().document,
        id: current.id,
      });
      selectActiveSave(saved);
      toast.success(`Updated “${saved.name}”.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The current plan could not be updated.",
      );
    }
  }, [editor, openSavePlan, selectActiveSave, storage]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }
      event.preventDefault();
      if (event.repeat || savePlanOpen || managePlansOpen) return;
      if (event.shiftKey) {
        openSavePlan();
      } else {
        void saveCurrentPlan();
      }
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [managePlansOpen, openSavePlan, saveCurrentPlan, savePlanOpen]);

  const addPendingNode = (selection: NodePickerSelection) => {
    if (!pendingNode) return;
    editor.dispatch({
      type: "node.create",
      at: pendingNode.at,
      buildableId: selection.buildableId,
      label: selection.label,
      recipeId: selection.recipeId,
    });
    setPendingNode(null);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    const at = canvas.screenToWorld({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    const hit = editor.hitTest(at);
    if (!hit) {
      requestNodeAt(at);
      return false;
    }
    if (!editor.getState().selectedIds.includes(hit.id)) {
      editor.dispatch({ type: "selection.node", additive: false, id: hit.id });
    }
    return true;
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const document = parseCanvasDocument(await file.text());
      selectActiveSave(null);
      editor.dispatch({ type: "document.replace", document });
      requestAnimationFrame(() => canvasRef.current?.fitContent());
      toast.success(`Imported ${document.nodes.length} nodes.`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The plan could not be imported.",
      );
    }
  };

  const exportDocument = () => {
    const serialized = serializeCanvasDocument(editor.getState().document);
    const url = URL.createObjectURL(
      new Blob([serialized], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.download = "satisfactory-belt-plan.json";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Plan exported.");
  };

  const deleteSelection = () => editor.dispatch({ type: "selection.delete" });
  const duplicateSelection = () =>
    editor.dispatch({ type: "selection.duplicate" });
  const requestNodeAtCenter = () => {
    const center = canvasRef.current?.getViewportCenter();
    if (center) requestNodeAt(center);
  };
  const loadDocument = (save: SavedCanvasDocument) => {
    selectActiveSave(save);
    editor.dispatch({ type: "document.replace", document: save.document });
    requestAnimationFrame(() => canvasRef.current?.fitContent());
    if (autosaveEnabled) {
      void storage.saveWorkspace(save.document, save.id).catch(() => {
        toast.error("The current saved plan could not be remembered.");
      });
    }
    toast.success(`Loaded “${save.name}”.`);
  };
  const resetCanvas = () => {
    selectActiveSave(null);
    editor.dispatch({ type: "document.reset" });
    canvasRef.current?.resetView();
    setResetCanvasOpen(false);
    toast.success("Canvas reset.");
  };

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-canvas text-foreground">
      <h1 className="sr-only">Satisfactory Belt canvas</h1>
      <CanvasContextMenu
        onContextMenu={handleContextMenu}
        onDelete={deleteSelection}
        onDuplicate={duplicateSelection}
      >
        <InfiniteCanvas
          editor={editor}
          onPerformanceMetricsChange={handlePerformanceMetricsChange}
          onRequestAddNode={requestNodeAt}
          onViewportChange={handleViewportChange}
          performanceMetricsEnabled={showPerformance}
          ref={canvasRef}
          showGridDots={showGridDots}
        />
      </CanvasContextMenu>

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-3 top-3 sm:left-4 sm:top-4">
          <CanvasMenu
            activeSaveName={activeSave?.name}
            canDelete={editorState.selectedCount > 0}
            canDuplicate={editorState.selectedCount > 0}
            canFitAll={editorState.nodeCount > 0}
            canFitSelection={editorState.selectedCount > 0}
            canResetCanvas={
              editorState.nodeCount > 0 ||
              editorState.canUndo ||
              editorState.canRedo
            }
            onAddNode={requestNodeAtCenter}
            onDelete={deleteSelection}
            onDuplicate={duplicateSelection}
            onExport={exportDocument}
            onFitAll={() => canvasRef.current?.fitContent()}
            onFitSelection={() => canvasRef.current?.fitSelection()}
            onImport={() => importInputRef.current?.click()}
            onManagePlans={() => setManagePlansOpen(true)}
            onSave={() => void saveCurrentPlan()}
            onSaveAs={openSavePlan}
            onResetCanvas={() => setResetCanvasOpen(true)}
            onResetView={() => canvasRef.current?.resetView()}
            onShowGridDotsChange={handleShowGridDotsChange}
            onShowPerformanceChange={handleShowPerformanceChange}
            onSnapToGridChange={(enabled) => {
              editor.dispatch({ type: "settings.snap", enabled });
              writeBooleanPreference(CANVAS_PREFERENCES.snapToGrid, enabled);
            }}
            showGridDots={showGridDots}
            showPerformance={showPerformance}
            snapToGrid={editorState.snapToGrid}
          />
        </div>

        {editorState.nodeCount === 0 && (
          <CanvasEmptyState
            onAddNode={requestNodeAtCenter}
            onImport={() => importInputRef.current?.click()}
            onManagePlans={() => setManagePlansOpen(true)}
          />
        )}

        <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 lg:bottom-4 lg:left-4 lg:translate-x-0">
          <CanvasControls
            canRedo={editorState.canRedo}
            canUndo={editorState.canUndo}
            onRedo={() => editor.dispatch({ type: "history.redo" })}
            onResetView={() => canvasRef.current?.resetView()}
            onUndo={() => editor.dispatch({ type: "history.undo" })}
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            zoom={zoom}
          />
        </div>

        {showPerformance && (
          <div className="pointer-events-auto absolute bottom-16 left-1/2 max-w-full -translate-x-1/2 lg:bottom-4">
            <PerformanceBar
              metrics={performanceMetrics}
              nodeCount={editorState.nodeCount}
              selectedCount={editorState.selectedCount}
            />
          </div>
        )}
      </div>

      <input
        accept="application/json,.json"
        className="sr-only"
        onChange={(event) => void handleImport(event)}
        ref={importInputRef}
        tabIndex={-1}
        type="file"
      />
      <Suspense fallback={null}>
        <NodePicker
          onOpenChange={(open) => {
            if (!open) setPendingNode(null);
          }}
          onSelect={addPendingNode}
          open={pendingNode !== null}
        />
      </Suspense>
      <ManagePlansDialog
        activeSave={activeSave}
        onDelete={(save) => {
          if (save.id !== activeSaveRef.current?.id) return;
          selectActiveSave(null);
          if (autosaveEnabled) {
            void storage
              .saveWorkspace(editor.getState().document, null)
              .catch(() => {
                toast.error("The current saved plan could not be cleared.");
              });
          }
        }}
        onLoad={loadDocument}
        onOpenChange={setManagePlansOpen}
        open={managePlansOpen}
        storage={storage}
      />
      <SavePlanDialog
        activeSave={activeSave}
        currentDocument={editor.getState().document}
        onOpenChange={setSavePlanOpen}
        onSaved={selectActiveSave}
        open={savePlanOpen}
        storage={storage}
      />
      <AlertDialog onOpenChange={setResetCanvasOpen} open={resetCanvasOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears every node and the undo history. Your named saved
              plans are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetCanvas} variant="destructive">
              Reset canvas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export function App() {
  const fixtureNodeCount = useMemo(
    () =>
      import.meta.env.DEV ? loadFixtureNodeCount(window.location.search) : 0,
    [],
  );
  const storage = useMemo(() => createIndexedDbDocumentStorage(), []);
  const [bootstrap, setBootstrap] = useState<BootstrapState>(() =>
    fixtureNodeCount > 0
      ? {
          activeSave: null,
          document: createCanvasLoadFixture(fixtureNodeCount),
          ready: true,
        }
      : { ready: false },
  );

  useEffect(() => {
    if (fixtureNodeCount > 0 || bootstrap.ready) return;
    let active = true;
    void storage
      .loadWorkspace()
      .then((workspace) => {
        if (active) {
          setBootstrap({
            activeSave: workspace.activeSave,
            document: workspace.document ?? undefined,
            ready: true,
          });
        }
      })
      .catch(() => {
        if (active) {
          setBootstrap({ activeSave: null, ready: true });
          toast.error("The previous browser session could not be restored.");
        }
      });
    return () => {
      active = false;
    };
  }, [bootstrap.ready, fixtureNodeCount, storage]);

  return (
    <>
      {bootstrap.ready ? (
        <CanvasWorkspace
          autosaveEnabled={fixtureNodeCount === 0}
          initialActiveSave={bootstrap.activeSave}
          initialDocument={bootstrap.document}
          storage={storage}
        />
      ) : (
        <main
          aria-busy="true"
          aria-label="Loading canvas"
          className="h-dvh w-dvw bg-canvas"
        />
      )}
      <Toaster position="top-center" richColors />
    </>
  );
}
