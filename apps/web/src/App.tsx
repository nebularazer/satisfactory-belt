import { CanvasController, GRID_SIZE, MAX_ZOOM, MIN_ZOOM } from "@satisfactory-belt/canvas-core";
import type { CanvasCommand, CanvasItem } from "@satisfactory-belt/canvas-core";
import { mountCanvas } from "@satisfactory-belt/canvas-pixi";
import type { CanvasView } from "@satisfactory-belt/canvas-pixi";
import type { Preferences } from "@satisfactory-belt/preferences";
import {
  Grid2X2Icon,
  MaximizeIcon,
  MenuIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function createExampleCanvas() {
  let items: readonly CanvasItem[] = Array.from({ length: 6 }, (_, index) => ({
    id: `rectangle-${index + 1}`,
    text: `Rectangle ${String(index + 1).padStart(2, "0")}`,
    x: (5 + (index % 3) * 9) * GRID_SIZE,
    y: (5 + Math.floor(index / 3) * 6) * GRID_SIZE,
    width: 7 * GRID_SIZE,
    height: 4 * GRID_SIZE,
  }));
  const controller = new CanvasController({
    items,
    onMove(moves) {
      const positions = new Map(moves.map((move) => [move.id, move]));
      items = items.map((item) => {
        const position = positions.get(item.id);
        return position ? { ...item, x: position.x, y: position.y } : item;
      });
      controller.setItems(items);
    },
  });
  return controller;
}

const menuButton = (
  <Button variant="outline" size="icon" className="bg-white shadow-sm" aria-label="Canvas menu" />
);

export function App({ preferences }: { preferences: Preferences }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<CanvasView | null>(null);
  const [controller] = useState(createExampleCanvas);
  const [error, setError] = useState<string | null>(null);
  const zoom = useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().camera.zoom,
  );
  const { gridSnapping } = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);

  useEffect(() => {
    void preferences.load();
  }, [preferences]);
  useEffect(() => {
    controller.setGridSnapping(gridSnapping);
  }, [controller, gridSnapping]);

  useEffect(() => {
    const abort = new AbortController();
    void mountCanvas(host.current!, controller, {
      signal: abort.signal,
      fontFamily: "Inter Variable",
    })
      .then((mounted) => {
        if (abort.signal.aborted) return;
        view.current = mounted;
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
  }, [controller]);

  const { reset, fit, zoomIn, zoomOut, controlZoomIn, controlZoomOut, actualSize, canvasFocus } =
    useMemo(() => {
      function zoomControl(command: CanvasCommand) {
        controller.command(command);
        view.current?.focus();
      }
      return {
        reset: () => controller.command("reset"),
        fit: () => controller.command("fit"),
        zoomIn: () => controller.command("zoom-in"),
        zoomOut: () => controller.command("zoom-out"),
        controlZoomIn: () => zoomControl("zoom-in"),
        controlZoomOut: () => zoomControl("zoom-out"),
        actualSize: () => zoomControl("actual-size"),
        canvasFocus: () => host.current?.querySelector("canvas") ?? null,
      };
    }, [controller]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#fafafa]">
      <div ref={host} className="absolute inset-0" />
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))]">
        <DropdownMenu>
          <DropdownMenuTrigger render={menuButton}>
            <MenuIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-50" sideOffset={8} finalFocus={canvasFocus}>
            <DropdownMenuGroup>
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
            <DropdownMenuCheckboxItem
              checked={gridSnapping}
              onCheckedChange={preferences.setGridSnapping}
            >
              <Grid2X2Icon className="text-muted-foreground" />
              Snap to grid
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ButtonGroup
        aria-label="Zoom controls"
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] rounded-lg bg-white shadow-sm"
      >
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
      {error && (
        <p role="alert" className="absolute inset-x-8 top-1/2 text-center text-sm text-destructive">
          Unable to start the canvas: {error}
        </p>
      )}
    </main>
  );
}
