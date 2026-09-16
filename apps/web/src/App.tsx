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
import { createSearchIndex } from "@satisfactory-belt/game-data/search";
import type { SearchEntry, SearchScope } from "@satisfactory-belt/game-data/search";
import { isThemePreference } from "@satisfactory-belt/preferences";
import type { Preferences } from "@satisfactory-belt/preferences";
import {
  ActivityIcon,
  SearchIcon,
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
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";

import { CatalogSearch } from "@/components/catalog-search";
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
import type { BrowserTheme } from "@/lib/browser-theme";
import { catalogConfiguration, eligibleCatalogEntries } from "@/lib/catalog-placement";
import { createExampleFactory } from "@/lib/example-factory";
import { createFactoryEditor } from "@/lib/factory-editor";
import { loadGameAssets } from "@/lib/game-assets";
import type { GameAssets } from "@/lib/game-assets";

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
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    loadGameAssets(abort.signal)
      .then(setAssets)
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Game data could not load.");
      });
    return () => abort.abort();
  }, []);
  if (!assets)
    return (
      <main className="flex h-dvh items-center justify-center bg-background p-8">
        <p
          role={error ? "alert" : "status"}
          className="max-w-lg text-center text-sm text-muted-foreground"
        >
          {error ?? "Loading machines…"}
        </p>
      </main>
    );
  return <CanvasWorkspace preferences={preferences} assets={assets} theme={theme} />;
}

function CanvasWorkspace({
  preferences,
  assets,
  theme,
}: {
  preferences: Preferences;
  assets: GameAssets;
  theme: BrowserTheme;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [insertion, setInsertion] = useState<CatalogRequest | null>(null);
  const placedFromSearch = useRef(false);
  const view = useRef<CanvasView | null>(null);
  const [editor] = useState(() =>
    createFactoryEditor(assets.catalog, createExampleFactory(assets.catalog)),
  );
  const { controller, history, historyCommand, clipboardCommand, deleteSelection, getDisplay } =
    editor;
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
        placedFromSearch.current = false;
        setInsertion(request);
        setSearchOpen(true);
      }),
    [controller],
  );
  const openSearch = useCallback(() => controller.openCatalogAtCenter(), [controller]);
  const placeResult = useCallback(
    (entry: SearchEntry, scope?: SearchScope) => {
      if (!insertion) throw new Error("Open search from the canvas to place a node.");
      editor.placeNode(catalogConfiguration(entry, scope), insertion.position, insertion.source);
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
  }, [controller, historyCommand, preferences, assets, getDisplay, theme]);

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
        if (searchOpen || event.defaultPrevented || event.nativeEvent.isComposing) return;
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']"))
        )
          return;
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
  }, [controller, historyCommand, clipboardCommand, deleteSelection, searchOpen]);

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
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))]">
        <DropdownMenu>
          <DropdownMenuTrigger render={menuButton}>
            <MenuIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-50"
            sideOffset={8}
            finalFocus={searchOpen ? false : canvasFocus}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={openSearch}>
                <SearchIcon className="text-muted-foreground" />
                Search catalog
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
      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] flex items-center gap-2">
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
      {showPerformance && performanceMonitor && <PerformanceBar monitor={performanceMonitor} />}
      {error && (
        <p role="alert" className="absolute inset-x-8 top-1/2 text-center text-sm text-destructive">
          Unable to start the canvas: {error}
        </p>
      )}
    </main>
  );
}
