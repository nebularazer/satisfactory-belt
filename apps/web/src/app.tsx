import { requestCanvasArrangement } from "@/canvas/auto-layout-request";
import { requestDetailedConversion } from "@/detailed-conversion/request-conversion";
import { requestAutoBuild } from "@/auto-build/request-auto-build";
import { prepareProductionInsertion } from "@/canvas/insert-production";
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
  type TouchEvent as ReactTouchEvent,
} from "react";
import { toast } from "sonner";
import { nodeChoicesForBuildable } from "@satisfactory-belt/production";

import { runCanvasBenchmark } from "@/canvas/benchmark";
import {
  canvasDocumentForConnection,
  compatibleTemplatePortIds,
} from "@/canvas/connection-compatibility";
import {
  attachCanvasAutosave,
  createIndexedDbDocumentStorage,
  type CanvasDocumentStorage,
  type SavedCanvasDocument,
} from "@/canvas/document-storage";
import { createCanvasEditor } from "@/canvas/editor";
import {
  detailedDocumentFromEditor,
  detailedDocumentToEditor,
  type CanvasEditorMode,
} from "@/canvas/editor-mode";
import { canvasNodeId, type CanvasDocument } from "@/canvas/document";
import type { Point } from "@/canvas/geometry";
import type { CanvasConnectionRequest } from "@/canvas/interactions";
import {
  createCanvasLoadFixture,
  loadFixtureNodeCount,
} from "@/canvas/load-fixture";
import type { InfiniteCanvasHandle } from "@/canvas/infinite-canvas";
import type { CanvasPerformanceMetrics } from "@/canvas/performance";
import {
  parseCanvasPlanDocument,
  serializeCanvasPlanDocument,
  type CanvasPlanDocument,
} from "@/canvas/plan-document-format";
import {
  CANVAS_PREFERENCES,
  readBooleanPreference,
  writeBooleanPreference,
} from "@/canvas/preferences";
import type { Viewport } from "@/canvas/viewport";
import { CanvasContextMenu } from "@/components/canvas-context-menu";
import { CanvasBuildBar } from "@/components/canvas-build-bar";
import { CanvasControls } from "@/components/canvas-controls";
import { CanvasEmptyState } from "@/components/canvas-empty-state";
import { CanvasMenu } from "@/components/canvas-menu";
import { ManagePlansDialog } from "@/components/manage-plans-dialog";
import type { NodePickerSelection } from "@/components/node-picker";
import { NodeSelectionBar } from "@/components/node-selection-bar";
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
const loadNodeInspector = () => import("@/components/node-inspector");
const loadMaterialLinkInspector = () =>
  import("@/components/material-link-inspector");
const loadInfiniteCanvas = () => import("@/canvas/infinite-canvas");
const InfiniteCanvas = lazy(async () => ({
  default: (await loadInfiniteCanvas()).InfiniteCanvas,
}));
const NodePicker = lazy(async () => ({
  default: (await loadNodePicker()).NodePicker,
}));
const NodeInspector = lazy(async () => ({
  default: (await loadNodeInspector()).NodeInspector,
}));
const MaterialLinkInspector = lazy(async () => ({
  default: (await loadMaterialLinkInspector()).MaterialLinkInspector,
}));
const AutoBuildDialog = lazy(async () => ({
  default: (await import("@/components/auto-build-dialog")).AutoBuildDialog,
}));

const CreateDetailedDialog = lazy(async () => ({
  default: (await import("@/components/create-detailed-dialog"))
    .CreateDetailedDialog,
}));

function preloadNodePicker() {
  void loadNodePicker();
}

type BootstrapState =
  | { ready: false }
  | {
      activeSave: SavedCanvasDocument | null;
      document?: CanvasPlanDocument;
      ready: true;
    };

type CanvasWorkspaceProps = {
  autosaveEnabled: boolean;
  initialActiveSave: SavedCanvasDocument | null;
  initialDocument?: CanvasPlanDocument;
  storage: CanvasDocumentStorage;
};

type PendingNodeRequest = Readonly<{
  at?: Point;
  connection?: CanvasConnectionRequest;
  placementAfterPick: boolean;
}>;

function quickBuildSelection(buildableId: string): NodePickerSelection {
  const choice = nodeChoicesForBuildable(buildableId)[0];
  if (!choice) throw new Error(`No Node choice exists for ${buildableId}.`);
  return { label: choice.label, node: choice.template };
}

function availableDetailedPlanName(
  sourceName: string,
  saves: readonly SavedCanvasDocument[],
) {
  const base = `${sourceName} — Detailed`;
  const names = new Set(saves.map(({ name }) => name.toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

function CanvasWorkspace({
  autosaveEnabled,
  initialActiveSave,
  initialDocument,
  storage,
}: CanvasWorkspaceProps) {
  const canvasRef = useRef<InfiniteCanvasHandle>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const initialMode: CanvasEditorMode =
    initialDocument?.kind === "detailed" ? "detailed" : "basic";
  const detailedTiersRef = useRef(
    initialDocument?.kind === "detailed" ? initialDocument.tiers : [],
  );
  const [editorMode, setEditorMode] = useState<CanvasEditorMode>(initialMode);
  const [editor, setEditor] = useState(() =>
    createCanvasEditor({
      ...(initialDocument
        ? {
            document:
              initialDocument.kind === "detailed"
                ? detailedDocumentToEditor(initialDocument)
                : initialDocument,
          }
        : {}),
      snapToGrid: readBooleanPreference(CANVAS_PREFERENCES.snapToGrid, true),
      topology: initialMode === "detailed" ? "physical" : "aggregate",
      logisticsTiers:
        initialDocument?.kind === "detailed"
          ? initialDocument.tiers
          : undefined,
    }),
  );
  const [arranging, setArranging] = useState(false);
  const arrangementRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    setArranging(false);
    return () => arrangementRequest.current?.abort();
  }, [editor]);
  const autoArrange = async () => {
    if (arrangementRequest.current || !editor.getState().document.nodes.length)
      return;
    const controller = new AbortController();
    arrangementRequest.current = controller;
    setArranging(true);
    const source = editor.getState().document;
    try {
      const document = await requestCanvasArrangement(
        source,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      editor.dispatch({ type: "document.arrange", source, document });
      if (editor.getState().document === document) {
        canvasRef.current?.fitContent();
      } else {
        toast.info(
          "The plan changed while arranging. Click Auto-arrange again.",
        );
      }
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(
          error instanceof Error ? error.message : "Auto-arrange failed.",
        );
    } finally {
      if (arrangementRequest.current === controller) {
        arrangementRequest.current = null;
        setArranging(false);
      }
    }
  };
  const getEditorUiState = useMemo(() => {
    const initialState = editor.getState();
    let cached = {
      canRedo: initialState.canRedo,
      canUndo: initialState.canUndo,
      nodeCount: initialState.document.nodes.length,
      selectedCount:
        initialState.selectedIds.length + initialState.selectedLinkIds.length,
      selectedNodeId:
        initialState.selectedIds.length === 1
          ? initialState.selectedIds[0]
          : undefined,
      selectedNodeCount: initialState.selectedIds.length,
      snapToGrid: initialState.snapToGrid,
    };

    return () => {
      const state = editor.getState();
      const nodeCount = state.document.nodes.length;
      const selectedCount =
        state.selectedIds.length + state.selectedLinkIds.length;
      const selectedNodeCount = state.selectedIds.length;
      const selectedNodeId =
        state.selectedIds.length === 1 ? state.selectedIds[0] : undefined;
      if (
        cached.canRedo !== state.canRedo ||
        cached.canUndo !== state.canUndo ||
        cached.nodeCount !== nodeCount ||
        cached.selectedCount !== selectedCount ||
        cached.selectedNodeId !== selectedNodeId ||
        cached.selectedNodeCount !== selectedNodeCount ||
        cached.snapToGrid !== state.snapToGrid
      ) {
        cached = {
          canRedo: state.canRedo,
          canUndo: state.canUndo,
          nodeCount,
          selectedCount,
          selectedNodeId,
          selectedNodeCount,
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
  const connectionError = useSyncExternalStore(
    editor.subscribe,
    () => editor.getState().connectionError,
    () => editor.getState().connectionError,
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
  const [pendingNode, setPendingNode] = useState<PendingNodeRequest | null>(
    null,
  );
  const [placement, setPlacement] = useState<NodePickerSelection | null>(null);
  const [autoBuild, setAutoBuild] = useState<{
    itemId: string;
    at?: Point;
    owner: typeof editor;
  } | null>(null);
  const [mobileNodeInspectorOpen, setMobileNodeInspectorOpen] = useState(false);
  const [resetCanvasOpen, setResetCanvasOpen] = useState(false);
  const [managePlansOpen, setManagePlansOpen] = useState(false);
  const [savePlanOpen, setSavePlanOpen] = useState(false);
  const [detailedCreation, setDetailedCreation] = useState<{
    owner: typeof editor;
    document: CanvasDocument;
    source: SavedCanvasDocument | null;
  } | null>(null);
  useEffect(() => {
    setDetailedCreation(null);
  }, [editor]);
  const [linkedDetailed, setLinkedDetailed] =
    useState<SavedCanvasDocument | null>(null);
  const [activeSave, setActiveSave] = useState<SavedCanvasDocument | null>(
    initialActiveSave,
  );
  const activeSaveRef = useRef<SavedCanvasDocument | null>(initialActiveSave);
  const selectActiveSave = useCallback((save: SavedCanvasDocument | null) => {
    activeSaveRef.current = save;
    setActiveSave(save);
  }, []);
  const currentPlanDocument = useCallback(
    (): CanvasPlanDocument =>
      editorMode === "detailed"
        ? detailedDocumentFromEditor(
            editor.getState().document,
            detailedTiersRef.current,
          )
        : editor.getState().document,
    [editor, editorMode],
  );
  const activateDocument = useCallback((document: CanvasPlanDocument) => {
    const mode = document.kind;
    if (mode === "detailed") detailedTiersRef.current = document.tiers;
    setEditor(
      createCanvasEditor({
        document:
          mode === "detailed" ? detailedDocumentToEditor(document) : document,
        snapToGrid: readBooleanPreference(CANVAS_PREFERENCES.snapToGrid, true),
        topology: mode === "detailed" ? "physical" : "aggregate",
        logisticsTiers:
          document.kind === "detailed" ? document.tiers : undefined,
      }),
    );
    setEditorMode(mode);
  }, []);
  const activateSave = useCallback(
    (save: SavedCanvasDocument) => {
      selectActiveSave(save);
      activateDocument(save.document);
      if (autosaveEnabled) {
        void storage.saveWorkspace(save.document, save.id).catch(() => {
          toast.error("The current saved plan could not be remembered.");
        });
      }
    },
    [activateDocument, autosaveEnabled, selectActiveSave, storage],
  );

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
      currentPlanDocument,
    );
  }, [autosaveEnabled, currentPlanDocument, editor, storage]);

  useEffect(() => {
    if (connectionError) toast.error(connectionError.message);
  }, [connectionError]);

  useEffect(() => {
    setMobileNodeInspectorOpen(false);
  }, [editorState.selectedNodeId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => canvasRef.current?.fitContent());
    return () => cancelAnimationFrame(frame);
  }, [editor]);

  useEffect(() => {
    let active = true;
    setLinkedDetailed(null);
    if (activeSave?.document.kind === "basic") {
      void storage
        .listNamed()
        .then((saves) => {
          if (active)
            setLinkedDetailed(
              saves.find(
                (save) =>
                  save.document.kind === "detailed" &&
                  save.sourceSaveId === activeSave.id,
              ) ?? null,
            );
        })
        .catch(() => {
          /* Opening the mode reports storage errors. */
        });
    }
    return () => {
      active = false;
    };
  }, [activeSave, managePlansOpen, storage]);

  const openDetailedPlan = useCallback(async () => {
    try {
      const current = currentPlanDocument();
      if (current.kind !== "basic")
        throw new Error("Only a Basic plan can create a Detailed plan.");
      const source = activeSaveRef.current;
      const saves = await storage.listNamed();
      const existing =
        source &&
        saves.find(
          (save) =>
            save.document.kind === "detailed" &&
            save.sourceSaveId === source.id,
        );
      if (existing) {
        await storage.saveNamed({ document: current, id: source.id });
        activateSave(existing);
        return;
      }
      setDetailedCreation({ owner: editor, document: current, source });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The Detailed plan could not be opened.",
      );
    }
  }, [activateSave, currentPlanDocument, editor, storage]);

  const changeEditorMode = useCallback(
    (mode: CanvasEditorMode) => {
      if (mode === editorMode) return;
      setPendingNode(null);
      setPlacement(null);
      setMobileNodeInspectorOpen(false);

      if (mode === "detailed") {
        void openDetailedPlan();
        return;
      }

      const detailed = activeSaveRef.current;
      if (!detailed || detailed.document.kind !== "detailed") return;
      if (!detailed.sourceSaveId) {
        toast.error("This Detailed plan has no linked Basic source.");
        return;
      }
      void (async () => {
        try {
          const savedDetailed = await storage.saveNamed({
            document: currentPlanDocument(),
            id: detailed.id,
            sourceSaveId: detailed.sourceSaveId,
          });
          const source = (await storage.listNamed()).find(
            ({ id }) => id === savedDetailed.sourceSaveId,
          );
          if (!source || source.document.kind !== "basic") {
            throw new Error("The linked Basic plan could not be found.");
          }
          activateSave(source);
          toast.success(`Opened “${source.name}”.`);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "The Basic plan could not be opened.",
          );
        }
      })();
    },
    [activateSave, currentPlanDocument, editorMode, openDetailedPlan, storage],
  );

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
  const requestNodeAt = useCallback(
    (at: Point, connection?: CanvasConnectionRequest) => {
      preloadNodePicker();
      setPendingNode({
        at,
        ...(connection ? { connection } : {}),
        placementAfterPick: false,
      });
    },
    [],
  );
  const requestNodePlacement = useCallback(() => {
    preloadNodePicker();
    setPendingNode({ placementAfterPick: true });
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
        document: currentPlanDocument(),
        id: current.id,
        sourceSaveId: current.sourceSaveId,
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
  }, [currentPlanDocument, openSavePlan, selectActiveSave, storage]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "s"
      ) {
        return;
      }
      event.preventDefault();
      if (event.repeat || savePlanOpen || managePlansOpen || detailedCreation)
        return;
      if (event.shiftKey) {
        openSavePlan();
      } else {
        void saveCurrentPlan();
      }
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [
    managePlansOpen,
    openSavePlan,
    saveCurrentPlan,
    savePlanOpen,
    detailedCreation,
  ]);

  const addPendingNode = (selection: NodePickerSelection) => {
    if (!pendingNode) return;
    if (pendingNode.placementAfterPick) {
      setPlacement(selection);
      setPendingNode(null);
      return;
    }
    if (!pendingNode.at) return;
    const connectionDocument = canvasDocumentForConnection(
      editor.getState().document,
      pendingNode.connection?.replacingLinkId,
    );
    const compatiblePortIds = pendingNode.connection
      ? compatibleTemplatePortIds(
          connectionDocument,
          pendingNode.connection.from,
          selection.node,
          editor.topology,
        )
      : [];
    editor.dispatch({
      type: "node.create",
      at: pendingNode.at,
      label: selection.label,
      node: selection.node,
    });
    const createdNodeId = editor.getState().selectedIds[0];
    if (pendingNode.connection && createdNodeId && compatiblePortIds[0]) {
      const to = { nodeId: createdNodeId, portId: compatiblePortIds[0] };
      if (pendingNode.connection.replacingLinkId) {
        editor.dispatch({
          type: "link.reconnect",
          from: pendingNode.connection.from,
          id: pendingNode.connection.replacingLinkId,
          to,
        });
      } else {
        editor.dispatch({
          type: "link.create",
          from: pendingNode.connection.from,
          to,
        });
      }
    }
    setPendingNode(null);
  };

  const allowPendingSelection = useCallback(
    (selection: NodePickerSelection) =>
      !pendingNode?.connection ||
      compatibleTemplatePortIds(
        canvasDocumentForConnection(
          editor.getState().document,
          pendingNode.connection.replacingLinkId,
        ),
        pendingNode.connection.from,
        selection.node,
        editor.topology,
      ).length > 0,
    [editor, pendingNode?.connection],
  );

  const placePendingNode = useCallback(
    (at: Point) => {
      if (!placement) return;
      editor.dispatch({
        type: "node.create",
        at,
        label: placement.label,
        node: placement.node,
      });
      setPlacement(null);
    },
    [editor, placement],
  );

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
      const link = editor.hitTestLink(at, 12 / zoom);
      if (link) {
        if (!editor.getState().selectedLinkIds.includes(link.id)) {
          editor.dispatch({
            type: "selection.link",
            additive: false,
            id: link.id,
          });
        }
        return true;
      }
      requestNodeAt(at);
      return false;
    }
    const hitId = canvasNodeId(hit);
    if (!editor.getState().selectedIds.includes(hitId)) {
      editor.dispatch({ type: "selection.node", additive: false, id: hitId });
    }
    return true;
  };

  const handleContextMenuTouchStart = (
    event: ReactTouchEvent<HTMLDivElement>,
  ) => {
    const canvas = canvasRef.current;
    const touch = event.touches.item(0);
    if (!canvas || event.touches.length !== 1 || !touch) return false;

    const bounds = event.currentTarget.getBoundingClientRect();
    const at = canvas.screenToWorld({
      x: touch.clientX - bounds.left,
      y: touch.clientY - bounds.top,
    });
    return Boolean(editor.hitTest(at) || editor.hitTestLink(at, 24 / zoom));
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const document = parseCanvasPlanDocument(await file.text());
      selectActiveSave(null);
      activateDocument(document);
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
    const serialized = serializeCanvasPlanDocument(currentPlanDocument());
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
  const loadDocument = (save: SavedCanvasDocument) => {
    activateSave(save);
    requestAnimationFrame(() => canvasRef.current?.fitContent());
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
    <main className="relative isolate h-dvh w-dvw touch-none overflow-hidden bg-canvas text-foreground">
      <h1 className="sr-only">Satisfactory Belt canvas</h1>
      <div className="absolute inset-0 z-0">
        <CanvasContextMenu
          onContextMenu={handleContextMenu}
          onDelete={deleteSelection}
          onDuplicate={duplicateSelection}
          onTouchStart={handleContextMenuTouchStart}
        >
          <Suspense fallback={<div className="infinite-canvas" />}>
            <InfiniteCanvas
              editor={editor}
              onCancelPlacement={() => setPlacement(null)}
              onPerformanceMetricsChange={handlePerformanceMetricsChange}
              onPlaceNode={placePendingNode}
              onRequestAddNode={requestNodeAt}
              onViewportChange={handleViewportChange}
              performanceMetricsEnabled={showPerformance}
              placementActive={placement !== null}
              ref={canvasRef}
              showGridDots={showGridDots}
            />
          </Suspense>
        </CanvasContextMenu>
      </div>

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-3 top-3 sm:left-4 sm:top-4">
          <CanvasMenu
            activeSaveName={activeSave?.name}
            canDelete={editorState.selectedCount > 0}
            canDuplicate={editorState.selectedNodeCount > 0}
            canFitAll={editorState.nodeCount > 0}
            canFitSelection={editorState.selectedNodeCount > 0}
            canResetCanvas={
              editorState.nodeCount > 0 ||
              editorState.canUndo ||
              editorState.canRedo
            }
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

        <div className="pointer-events-auto absolute top-3 left-1/2 max-w-[calc(100vw-5.5rem)] -translate-x-1/2 sm:top-4">
          <CanvasBuildBar
            detailedAvailable={
              editorMode === "detailed" ||
              (linkedDetailed !== null &&
                linkedDetailed.sourceSaveId === activeSave?.id)
            }
            basicAvailable={
              editorMode === "basic" || Boolean(activeSave?.sourceSaveId)
            }
            mode={editorMode}
            onAddMerger={() =>
              setPlacement(
                quickBuildSelection("Build_ConveyorAttachmentMerger_C"),
              )
            }
            onAddNode={requestNodePlacement}
            onAddSplitter={() =>
              setPlacement(
                quickBuildSelection("Build_ConveyorAttachmentSplitter_C"),
              )
            }
            onCancelPlacement={() => setPlacement(null)}
            onModeChange={changeEditorMode}
            placementLabel={placement?.label}
          />
        </div>

        {editorState.nodeCount === 0 && (
          <CanvasEmptyState
            onAddNode={requestNodePlacement}
            onImport={() => importInputRef.current?.click()}
            onManagePlans={() => setManagePlansOpen(true)}
          />
        )}

        <Suspense fallback={null}>
          <NodeInspector
            editor={editor}
            mode={editorMode}
            mobileOpen={mobileNodeInspectorOpen}
          />
          <MaterialLinkInspector editor={editor} mode={editorMode} />
        </Suspense>

        {!mobileNodeInspectorOpen && (
          <NodeSelectionBar
            editor={editor}
            onEdit={() => setMobileNodeInspectorOpen(true)}
          />
        )}

        <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 lg:bottom-4 lg:left-4 lg:translate-x-0">
          <CanvasControls
            canArrange={editorState.nodeCount > 0}
            arranging={arranging}
            onArrange={() => void autoArrange()}
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
          onAutoBuild={
            editorMode === "basic" && !pendingNode?.connection
              ? (itemId) => {
                  setAutoBuild({ itemId, at: pendingNode?.at, owner: editor });
                  setPendingNode(null);
                  setPlacement(null);
                }
              : undefined
          }
          allowSelection={
            pendingNode?.connection ? allowPendingSelection : undefined
          }
          replaceMachinesWithRecipes={Boolean(pendingNode?.connection)}
          onOpenChange={(open) => {
            if (!open) setPendingNode(null);
          }}
          onSelect={addPendingNode}
          open={pendingNode !== null}
        />
        {detailedCreation?.owner === editor && (
          <CreateDetailedDialog
            sourceName={detailedCreation.source?.name}
            onClose={() => setDetailedCreation(null)}
            onCreate={async (settings, name, signal, onStage) => {
              const { document: sourceDocument, source } = detailedCreation;
              const saves = await storage.listNamed();
              if (
                !source &&
                saves.some(
                  (save) =>
                    save.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
                )
              )
                throw new Error(
                  "A plan with this name already exists. Choose another name.",
                );
              const result = await requestDetailedConversion(
                sourceDocument,
                settings,
                signal,
                onStage,
              );
              signal.throwIfAborted();
              if (editor.getState().document !== sourceDocument)
                throw new Error(
                  "The Basic plan changed during conversion. Close this dialog and create Detailed again.",
                );
              onStage("Saving plan");
              const savedSource = await storage.saveNamed({
                document: sourceDocument,
                ...(source ? { id: source.id } : { name }),
              });
              // Keep the saved source for retry if saving its Detailed version fails.
              selectActiveSave(savedSource);
              setDetailedCreation((current) =>
                current ? { ...current, source: savedSource } : null,
              );
              const detailed = await storage.saveNamed({
                document: result,
                name: availableDetailedPlanName(savedSource.name, saves),
                sourceSaveId: savedSource.id,
              });
              activateSave(detailed);
              setDetailedCreation(null);
              toast.success("Created and arranged the Detailed plan.");
            }}
          />
        )}
        {autoBuild?.owner === editor && (
          <AutoBuildDialog
            itemId={autoBuild.itemId}
            onClose={() => setAutoBuild(null)}
            onGenerate={async (settings, signal, onStage) => {
              const source = editor.getState().document;
              const result = await requestAutoBuild(settings, signal, onStage);
              if (signal.aborted) return;
              if (source !== editor.getState().document)
                throw new Error(
                  "The canvas changed during generation. Please generate again.",
                );
              const document = prepareProductionInsertion(
                source,
                result.document,
                `auto-build:${crypto.randomUUID()}`,
                autoBuild.at,
              );
              editor.dispatch({ type: "document.insert", source, document });
              requestAnimationFrame(() => canvasRef.current?.fitSelection());
              toast.success(`Added ${document.nodes.length} production nodes.`);
              if (result.externalInputs.length)
                toast.info(
                  `Supply externally: ${result.externalInputs.map((input) => `${input.name} (${input.ratePerMinute}/min)`).join(", ")}.`,
                );
            }}
          />
        )}
      </Suspense>
      <ManagePlansDialog
        activeSave={activeSave}
        onDelete={(save) => {
          if (save.id !== activeSaveRef.current?.id) return;
          selectActiveSave(null);
          if (autosaveEnabled) {
            void storage
              .saveWorkspace(currentPlanDocument(), null)
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
        currentDocument={currentPlanDocument()}
        onOpenChange={setSavePlanOpen}
        onSaved={(save) => {
          selectActiveSave(save);
        }}
        open={savePlanOpen}
        sourceSaveId={activeSave?.sourceSaveId}
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
