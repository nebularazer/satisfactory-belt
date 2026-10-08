import {
  clipboardCommandForKey,
  deleteCommandForKey,
  historyCommandForKey,
  MAX_ZOOM,
  MIN_ZOOM,
} from "@satisfactory-belt/canvas-core";
import type { CanvasCommand, CatalogRequest } from "@satisfactory-belt/canvas-core";
import { mountCanvas } from "@satisfactory-belt/canvas-pixi";
import type { CanvasView, RenderPerformance } from "@satisfactory-belt/canvas-pixi";
import { parseFactoryJson } from "@satisfactory-belt/factory-saves";
import type { FactoryFile, FactorySave } from "@satisfactory-belt/factory-saves";
import { createSearchIndex } from "@satisfactory-belt/game-data/search";
import type { SearchEntry, SearchScope } from "@satisfactory-belt/game-data/search";
import { isThemePreference } from "@satisfactory-belt/preferences";
import type { Preferences } from "@satisfactory-belt/preferences";
import {
  ActivityIcon,
  SaveIcon,
  DownloadIcon,
  UploadIcon,
  FolderOpenIcon,
  Grid2X2Icon,
  Grid3X3Icon,
  MaximizeIcon,
  MenuIcon,
  MinusIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  PlusIcon,
  RotateCcwIcon,
  Undo2Icon,
  Redo2Icon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";

import { CatalogSearch } from "@/components/catalog-search";
import { ClearCanvasDialog } from "@/components/clear-canvas-dialog";
import { FactorySavesDialog } from "@/components/factory-saves-dialog";
import { Inspector } from "@/components/inspector";
import { PerformanceBar } from "@/components/performance-bar";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadFactoryJson } from "@/lib/browser-factory-files";
import { createBrowserPlanStore } from "@/lib/browser-plan-store";
import type { PlanStore } from "@/lib/browser-plan-store";
import type { BrowserTheme } from "@/lib/browser-theme";
import { catalogConfiguration, eligibleCatalogEntries } from "@/lib/catalog-placement";
import { createFactoryEditor } from "@/lib/factory-editor";
import { loadGameAssets } from "@/lib/game-assets";
import type { GameAssets } from "@/lib/game-assets";
import { inspectorTarget } from "@/lib/inspector";
import { startPlanAutosave } from "@/lib/plan-autosave";
import { createReferencePlans } from "@/lib/reference-plans";

const searchMenuFocus = () =>
  document.querySelector<HTMLButtonElement>('button[aria-label="Canvas menu"]');

const menuButton = (
  <Button
    variant="outline"
    size="icon"
    className="bg-background shadow-sm"
    aria-label="Canvas menu"
  />
);

export function App({ preferences, theme }: { preferences: Preferences; theme: BrowserTheme }) {
  const [workspace, setWorkspace] = useState<{
    assets: GameAssets;
    editor: ReturnType<typeof createFactoryEditor>;
    store: PlanStore;
    saved: FactorySave | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let store: PlanStore | undefined;
    async function loadWorkspace() {
      const assets = await loadGameAssets(abort.signal);
      if (abort.signal.aborted) return;
      store = await createBrowserPlanStore();
      if (abort.signal.aborted) {
        store.close();
        return;
      }
      const saved = await store.loadActive();
      if (abort.signal.aborted) return;
      const document = saved?.document ?? createReferencePlans();
      const editor = createFactoryEditor(assets.catalog, document);
      setWorkspace({ assets, editor, store, saved: saved ?? null });
    }
    void loadWorkspace().catch((reason: unknown) => {
      store?.close();
      if (!abort.signal.aborted)
        setError(reason instanceof Error ? reason.message : "The saved plan could not load.");
    });
    return () => {
      abort.abort();
      store?.close();
    };
  }, []);
  if (!workspace)
    return (
      <main className="flex h-dvh items-center justify-center bg-background p-8">
        <p
          role={error ? "alert" : "status"}
          className="max-w-lg text-center text-sm text-muted-foreground"
        >
          {error ?? "Loading plan…"}
        </p>
      </main>
    );
  return (
    <CanvasWorkspace
      preferences={preferences}
      assets={workspace.assets}
      initialEditor={workspace.editor}
      initialSave={workspace.saved}
      store={workspace.store}
      theme={theme}
    />
  );
}

function CanvasWorkspace({
  preferences,
  assets,
  initialEditor,
  initialSave,
  store,
  theme,
}: {
  preferences: Preferences;
  assets: GameAssets;
  initialEditor: ReturnType<typeof createFactoryEditor>;
  initialSave: FactorySave | null;
  store: PlanStore;
  theme: BrowserTheme;
}) {
  const [editor, setEditor] = useState(initialEditor);
  const [activeSave, setActiveSave] = useState<FactorySave | null>(initialSave);
  const [savesOpen, setSavesOpen] = useState(false);
  const [saveDialog, setSaveDialog] = useState(false);
  const openSaves = useCallback(() => {
    setSaveDialog(false);
    setSavesOpen(true);
  }, []);
  const openSaveAs = useCallback(() => {
    setSaveDialog(true);
    setSavesOpen(true);
  }, []);
  const [importedFactory, setImportedFactory] = useState<FactoryFile | null>(null);
  const [readingImport, setReadingImport] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importRevision = useRef(0);
  const openImport = useCallback(() => fileInput.current?.click(), []);
  const changeImportOpen = useCallback((open: boolean) => {
    if (!open) setImportedFactory(null);
  }, []);
  const readImport = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file) return;
      const revision = ++importRevision.current;
      setReadingImport(true);
      setFileError(null);
      try {
        const imported = parseFactoryJson(await file.text(), assets.catalog);
        if (revision === importRevision.current) setImportedFactory(imported);
      } catch (reason) {
        if (revision === importRevision.current)
          setFileError(
            reason instanceof Error ? reason.message : "The factory file could not be read.",
          );
      } finally {
        if (revision === importRevision.current) setReadingImport(false);
      }
    },
    [assets],
  );
  const host = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [clearCanvasOpen, setClearCanvasOpen] = useState(false);
  const openClearCanvas = useCallback(() => setClearCanvasOpen(true), []);
  const [insertion, setInsertion] = useState<CatalogRequest | null>(null);
  const placedFromSearch = useRef(false);
  const view = useRef<CanvasView | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    if (!activeSave) return undefined;
    return startPlanAutosave(
      editor.history,
      {
        save: (document) => store.save(activeSave.id, document),
      },
      setSaveError,
    );
  }, [editor, store, activeSave]);
  const loadFactory = useCallback(
    async (id: string) => {
      // Persist even after an earlier autosave failure before leaving this factory.
      if (activeSave) await store.save(activeSave.id, editor.history.getSnapshot().state);
      const saved = await store.load(id);
      if (!saved) throw new Error("This factory is no longer saved.");
      const nextEditor = createFactoryEditor(assets.catalog, saved.document);
      await store.select(id);
      setSaveError(null);
      setEditor(nextEditor);
      setActiveSave({ id: saved.id, name: saved.name, updatedAt: saved.updatedAt });
    },
    [activeSave, assets, editor, store],
  );
  const saveAsFactory = useCallback(
    async (name: string) => {
      const document = editor.history.getSnapshot().state;
      const saved = await store.create(name, document);
      setSaveError(null);
      setActiveSave(saved);
    },
    [editor, store],
  );
  const overwriteFactory = useCallback(
    async (id: string) => {
      const saved = await store.overwrite(id, editor.history.getSnapshot().state);
      setSaveError(null);
      setActiveSave(saved);
    },
    [editor, store],
  );
  const commitImport = useCallback(
    async (name: string, overwriteId?: string) => {
      if (!importedFactory) throw new Error("Choose a factory file first.");
      const nextEditor = createFactoryEditor(assets.catalog, importedFactory.document);
      if (activeSave) await store.save(activeSave.id, editor.history.getSnapshot().state);
      const document = nextEditor.history.getSnapshot().state;
      const saved = overwriteId
        ? await store.overwrite(overwriteId, document)
        : await store.create(name, document);
      setSaveError(null);
      setEditor(nextEditor);
      setActiveSave(saved);
    },
    [activeSave, assets, editor, importedFactory, store],
  );
  const importAsFactory = useCallback((name: string) => commitImport(name), [commitImport]);
  const overwriteImport = useCallback(
    (id: string) => commitImport(importedFactory?.name ?? "", id),
    [commitImport, importedFactory],
  );
  const exportFactory = useCallback(() => {
    setFileError(null);
    try {
      downloadFactoryJson({
        name: activeSave?.name ?? "Factory 1",
        document: editor.history.getSnapshot().state,
      });
    } catch (reason) {
      setFileError(reason instanceof Error ? reason.message : "The factory could not be exported.");
    }
  }, [activeSave, editor]);
  const deleteFactory = useCallback(
    async (id: string) => {
      await store.delete(id);
      if (activeSave?.id === id) {
        setSaveError(null);
        setActiveSave(null);
      }
    },
    [activeSave, store],
  );
  const {
    controller,
    history,
    historyCommand,
    clipboardCommand,
    deleteSelection,
    getDisplay,
    getPortRate,
    getPortIcons,
    getLinkRates,
  } = editor;
  const index = useMemo(() => createSearchIndex(assets.catalog), [assets.catalog]);
  const documentState = useSyncExternalStore(history.subscribe, history.getSnapshot).state;
  const allowedEntryIds = useMemo(
    () =>
      searchOpen && insertion?.source
        ? !documentState.nodes.some((node) => node.id === insertion.source?.nodeId)
          ? new Set<string>()
          : eligibleCatalogEntries(index, (configuration) =>
              editor.canPlace(configuration, insertion.source),
            )
        : undefined,
    [editor, index, insertion, documentState, searchOpen],
  );
  useEffect(
    () =>
      controller.subscribeCatalog((request) => {
        if (window.matchMedia("(max-width: 639px)").matches) controller.setSelection(new Set());
        placedFromSearch.current = false;
        setInsertion(request);
        setSearchOpen(true);
      }),
    [controller],
  );
  useEffect(() => {
    if (!searchOpen) return undefined;
    return controller.subscribe(() => {
      const snapshot = controller.getSnapshot();
      if (
        window.matchMedia("(max-width: 639px)").matches &&
        snapshot.interaction === "idle" &&
        inspectorTarget(snapshot)
      ) {
        setSearchOpen(false);
      }
    });
  }, [controller, searchOpen]);
  const focusCanvas = useCallback(() => view.current?.focus(), []);
  const openAdd = useCallback(() => controller.openCatalogAtCenter(), [controller]);
  const placeResult = useCallback(
    (entry: SearchEntry, scope?: SearchScope) => {
      if (!insertion) throw new Error("Open search from the canvas to place a node.");
      editor.placeNode(catalogConfiguration(entry, scope), insertion.position, insertion.source);
      // Leave the canvas visible after mobile placement; tapping a node opens its inspector.
      if (window.matchMedia("(max-width: 639px)").matches)
        editor.controller.setSelection(new Set());
      placedFromSearch.current = true;
    },
    [editor, insertion],
  );
  const searchFinalFocus = useCallback(
    () =>
      placedFromSearch.current || insertion?.source
        ? (host.current?.querySelector("canvas") ?? null)
        : searchMenuFocus(),
    [insertion],
  );
  const { canUndo, canRedo } = useSyncExternalStore(history.subscribe, history.getSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [performanceMonitor, setPerformanceMonitor] = useState<RenderPerformance | null>(null);
  const zoom = useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().camera.zoom,
  );
  const changeTheme = useCallback(
    (value: unknown) => {
      if (isThemePreference(value)) preferences.setTheme(value);
    },
    [preferences],
  );
  const resolvedTheme = useSyncExternalStore(theme.subscribe, theme.getSnapshot);
  const {
    gridSnapping,
    showGrid,
    showPerformance,
    theme: themePreference,
  } = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);

  useEffect(() => {
    view.current?.setTheme(resolvedTheme);
  }, [resolvedTheme]);
  useEffect(() => {
    controller.setGridSnapping(gridSnapping);
  }, [controller, gridSnapping]);

  useEffect(() => {
    view.current?.setShowGrid(showGrid);
  }, [showGrid]);

  useEffect(() => {
    view.current?.setShowPerformance(showPerformance);
  }, [showPerformance]);

  useEffect(() => {
    const abort = new AbortController();
    void mountCanvas(host.current!, controller, {
      signal: abort.signal,
      theme: theme.getSnapshot(),
      getDisplay,
      getPortRate,
      getPortIcons,
      getLinkRates,
      iconManifest: assets.icons,
      assetBaseUrl: assets.baseUrl,
      fontFamily: "Inter Variable",
      onHistoryCommand: historyCommand,
    })
      .then((mounted) => {
        if (abort.signal.aborted) return;
        view.current = mounted;
        mounted.setTheme(theme.getSnapshot());
        mounted.setShowGrid(preferences.getSnapshot().showGrid);
        mounted.setShowPerformance(preferences.getSnapshot().showPerformance);
        setPerformanceMonitor(mounted.performance);
        controller.command("fit");
        mounted.focus();
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setError(reason instanceof Error ? reason.message : "The canvas could not start.");
      });
    return () => {
      abort.abort();
      view.current = null;
    };
  }, [
    controller,
    historyCommand,
    preferences,
    assets,
    getDisplay,
    getPortRate,
    getPortIcons,
    getLinkRates,
    theme,
  ]);

  const {
    reset,
    fit,
    zoomIn,
    zoomOut,
    controlZoomIn,
    controlZoomOut,
    actualSize,
    canvasFocus,
    undo,
    redo,
    workspaceKeyDown,
  } = useMemo(() => {
    function zoomControl(command: CanvasCommand) {
      controller.command(command);
      view.current?.focus();
    }
    return {
      workspaceKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        // Document shortcuts also support focused controls and portalled menus.
        // History may already have been handled by the renderer.
        if (
          searchOpen ||
          clearCanvasOpen ||
          savesOpen ||
          importedFactory !== null ||
          event.defaultPrevented ||
          event.nativeEvent.isComposing
        )
          return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']"))
        )
          return;
        if (
          event.key.toLowerCase() === "n" &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          if (!event.repeat) openAdd();
          return;
        }
        if (deleteCommandForKey(event)) {
          event.preventDefault();
          if (!event.repeat) deleteSelection();
          return;
        }
        const clipboard = clipboardCommandForKey(event);
        if (clipboard) {
          event.preventDefault();
          if (!event.repeat) clipboardCommand(clipboard);
          return;
        }
        const command = historyCommandForKey(event);
        if (!command) return;
        event.preventDefault();
        historyCommand(command);
      },
      undo: () => {
        historyCommand("undo");
        view.current?.focus();
      },
      redo: () => {
        historyCommand("redo");
        view.current?.focus();
      },
      reset: () => controller.command("reset"),
      fit: () => controller.command("fit"),
      zoomIn: () => controller.command("zoom-in"),
      zoomOut: () => controller.command("zoom-out"),
      controlZoomIn: () => zoomControl("zoom-in"),
      controlZoomOut: () => zoomControl("zoom-out"),
      actualSize: () => zoomControl("actual-size"),
      canvasFocus: () => host.current?.querySelector("canvas") ?? null,
    };
  }, [
    controller,
    historyCommand,
    clipboardCommand,
    deleteSelection,
    searchOpen,
    clearCanvasOpen,
    savesOpen,
    importedFactory,
    openAdd,
  ]);

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Workspace shortcuts bubble from the canvas, controls, and portalled menus; preserve the main landmark.
    <main
      className="relative h-dvh w-full overflow-hidden bg-[#fafafa] dark:bg-[#18181b]"
      onKeyDown={workspaceKeyDown}
    >
      <CatalogSearch
        assets={assets}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        finalFocus={searchFinalFocus}
        onAdd={placeResult}
        allowedEntryIds={allowedEntryIds}
      />
      <div ref={host} className="absolute inset-0" />
      {savesOpen && (
        <FactorySavesDialog
          store={store}
          activeSave={activeSave}
          kind={saveDialog ? "save" : "open"}
          onOpenChange={setSavesOpen}
          onLoad={loadFactory}
          onSaveAs={saveAsFactory}
          onOverwrite={overwriteFactory}
          onDelete={deleteFactory}
          finalFocus={canvasFocus}
        />
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Import factory JSON"
        onChange={readImport}
      />
      {importedFactory && (
        <FactorySavesDialog
          store={store}
          activeSave={activeSave}
          kind="import"
          initialName={importedFactory.name}
          onOpenChange={changeImportOpen}
          onLoad={loadFactory}
          onSaveAs={importAsFactory}
          onOverwrite={overwriteImport}
          onDelete={deleteFactory}
          finalFocus={canvasFocus}
        />
      )}
      <ClearCanvasDialog
        open={clearCanvasOpen}
        onOpenChange={setClearCanvasOpen}
        onConfirm={editor.clearCanvas}
        finalFocus={canvasFocus}
      />
      {!documentState.nodes.length && !searchOpen && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              Plan production with groups of machines.
            </p>
            <Button className="pointer-events-auto" onClick={openAdd}>
              <PlusIcon />
              Add a building
            </Button>
          </div>
        </div>
      )}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))]">
        <DropdownMenu>
          <DropdownMenuTrigger render={menuButton}>
            <MenuIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-50"
            sideOffset={8}
            finalFocus={
              searchOpen || clearCanvasOpen || savesOpen || importedFactory ? false : canvasFocus
            }
          >
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={openSaves}>
                <FolderOpenIcon className="text-muted-foreground" />
                Open factory…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openSaveAs}>
                <SaveIcon className="text-muted-foreground" />
                Save as…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openImport} disabled={readingImport}>
                <UploadIcon className="text-muted-foreground" />
                Import JSON…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportFactory}>
                <DownloadIcon className="text-muted-foreground" />
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={openClearCanvas}>
                <Trash2Icon />
                Clear canvas…
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={openAdd} aria-keyshortcuts="n">
                <PlusIcon className="text-muted-foreground" />
                Add building
                <DropdownMenuShortcut className="min-w-6 text-right tracking-normal">
                  N
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={reset}>
                <RotateCcwIcon className="text-muted-foreground" />
                Reset view
                <DropdownMenuShortcut className="min-w-6 text-right tracking-normal">
                  0
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={fit}>
                <MaximizeIcon className="text-muted-foreground" />
                Fit all
                <DropdownMenuShortcut className="min-w-6 text-right tracking-normal">
                  ⇧ 1
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={zoom >= MAX_ZOOM} onClick={zoomIn}>
                <PlusIcon className="text-muted-foreground" />
                Zoom in
                <DropdownMenuShortcut className="min-w-6 text-right tracking-normal">
                  +
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={zoom <= MIN_ZOOM} onClick={zoomOut}>
                <MinusIcon className="text-muted-foreground" />
                Zoom out
                <DropdownMenuShortcut className="min-w-6 text-right tracking-normal">
                  −
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={showGrid} onCheckedChange={preferences.setShowGrid}>
              <Grid3X3Icon className="text-muted-foreground" />
              Show grid
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={gridSnapping}
              onCheckedChange={preferences.setGridSnapping}
            >
              <Grid2X2Icon className="text-muted-foreground" />
              Snap to grid
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Appearance</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={themePreference} onValueChange={changeTheme}>
                <DropdownMenuRadioItem value="light">
                  <SunIcon className="text-muted-foreground" />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">
                  <MonitorIcon className="text-muted-foreground" />
                  System
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <MoonIcon className="text-muted-foreground" />
                  Dark
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={showPerformance}
              onCheckedChange={preferences.setShowPerformance}
            >
              <ActivityIcon className="text-muted-foreground" />
              Show performance
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="pointer-events-none absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] flex flex-col gap-3">
        {showPerformance && performanceMonitor && <PerformanceBar monitor={performanceMonitor} />}
        <div className="pointer-events-auto flex w-fit items-center gap-2">
          <ButtonGroup aria-label="Zoom controls" className="rounded-lg bg-background shadow-sm">
            <Button
              variant="outline"
              size="icon"
              aria-label="Zoom out"
              title="Zoom out (−)"
              disabled={zoom <= MIN_ZOOM}
              onClick={controlZoomOut}
            >
              <MinusIcon />
            </Button>
            <Button
              variant="outline"
              className="tabular-nums"
              aria-label={`Zoom ${Math.round(zoom * 100)}%. Restore 100%`}
              title="Restore 100%"
              onClick={actualSize}
            >
              {Math.round(zoom * 100)}%
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Zoom in"
              title="Zoom in (+)"
              disabled={zoom >= MAX_ZOOM}
              onClick={controlZoomIn}
            >
              <PlusIcon />
            </Button>
          </ButtonGroup>
          <ButtonGroup aria-label="History controls" className="rounded-lg bg-background shadow-sm">
            <Button
              variant="outline"
              size="icon"
              aria-label="Undo"
              title="Undo (Ctrl/Cmd+Z)"
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo2Icon />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Redo"
              title="Redo (Ctrl/Cmd+Shift+Z)"
              disabled={!canRedo}
              onClick={redo}
            >
              <Redo2Icon />
            </Button>
          </ButtonGroup>
        </div>
        <Inspector
          editor={editor}
          focusCanvas={focusCanvas}
          assets={assets}
          catalogOpen={searchOpen}
        />
      </div>
      {error && (
        <p role="alert" className="absolute inset-x-8 top-1/2 text-center text-sm text-destructive">
          Unable to start the canvas: {error}
        </p>
      )}
      {readingImport && (
        <output className="absolute top-4 right-4 rounded-lg bg-background p-3 text-sm shadow-sm">
          Reading factory…
        </output>
      )}
      {fileError && (
        <p
          role="alert"
          className="absolute top-4 right-4 max-w-sm rounded-lg bg-background p-3 text-sm text-destructive shadow-sm"
        >
          {fileError}
        </p>
      )}
      {saveError && (
        <p
          role="alert"
          className="absolute top-4 right-4 max-w-sm rounded-lg bg-background p-3 text-sm text-destructive shadow-sm"
        >
          {saveError}
        </p>
      )}
    </main>
  );
}
