/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Deliberately local, disposable prototype controls. */
import { MAX_ZOOM, MIN_ZOOM } from "@satisfactory-belt/canvas-core";
import type { PortReference } from "@satisfactory-belt/canvas-core";
/** Experiment: can a separate construction canvas make a flow plan easier to build?
 * One agreed popup workflow, isolated on experiment/distribution-preview.
 */
import { PREVIEW_BELTS, formatPlanningNumber } from "@satisfactory-belt/factory-core";
import { MaximizeIcon, MinusIcon, PlusIcon, WorkflowIcon } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  PREVIEW_BELT_COLORS,
  distributionScene,
  distributionSnapshot,
} from "@/lib/distribution-prototype";
import type { DistributionSnapshot } from "@/lib/distribution-prototype";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

const legend = PREVIEW_BELT_COLORS.map((color, index) => ({
  tier: index + 1,
  capacity: PREVIEW_BELTS[index],
  style: { borderColor: `#${color.toString(16).padStart(6, "0")}` },
}));

export function DistributionPreviewPrototype({
  port,
  editor,
  assets,
}: {
  port: PortReference;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const [snapshot, setSnapshot] = useState<DistributionSnapshot | null>(null);
  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setSnapshot(distributionSnapshot(editor, assets, port))}
      >
        <WorkflowIcon />
        Preview distribution…
      </Button>
      {snapshot && <Preview snapshot={snapshot} assets={assets} close={() => setSnapshot(null)} />}
    </>
  );
}

function Preview({
  snapshot,
  assets,
  close,
}: {
  snapshot: DistributionSnapshot;
  assets: GameAssets;
  close: () => void;
}) {
  const [tier, setTier] = useState(6);
  const [mode, setMode] = useState<"balanced" | "manifold">("balanced");
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const scene = useMemo(
    () => distributionScene(snapshot, assets, tier, mode),
    [snapshot, assets, tier, mode],
  );
  const zoom = useSyncExternalStore(
    scene.controller.subscribe,
    () => scene.controller.getSnapshot().camera.zoom,
  );
  const [readyScene, setReadyScene] = useState<typeof scene | null>(null);
  useEffect(() => {
    if (!host || scene.graph.error) return undefined;
    const abort = new AbortController();
    void Promise.all([import("@satisfactory-belt/canvas-pixi"), scene.layout(abort.signal)])
      .then(([{ mountCanvas }]) =>
        mountCanvas(host, scene.controller, {
          getDisplay: scene.getDisplay,
          getLinkRates: scene.getLinkRates,
          iconManifest: assets.icons,
          assetBaseUrl: assets.baseUrl,
          fontFamily: "Inter Variable",
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          signal: abort.signal,
        }),
      )
      .then((view) => {
        if (abort.signal.aborted) return;
        scene.controller.command("fit");
        // Start readable; Fit remains available for the complete overview.
        if (scene.controller.getSnapshot().camera.zoom < 0.75) scene.controller.zoomTo(0.75);
        host
          ?.querySelector("canvas")
          ?.setAttribute(
            "aria-label",
            "Read-only distribution preview. Drag to pan, pinch or scroll to zoom.",
          );
        setReadyScene(scene);
        view.focus();
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Preview canvas could not start.");
      });
    return () => abort.abort();
  }, [scene, assets, host]);
  const splitters = scene.graph.nodes.filter((n) => n.kind === "splitter").length;
  const mergers = scene.graph.nodes.filter((n) => n.kind === "merger").length;
  const total = snapshot.sources.reduce((sum, entry) => sum + entry.rate, 0);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="flex h-[90dvh] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,calc(100%-3rem))]"
        onKeyDown={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
        }}
      >
        <div className="space-y-1 p-4 pr-12">
          <DialogTitle>
            {assets.catalog.items[snapshot.itemId]?.name ?? "Port"} distribution
          </DialogTitle>
          <DialogDescription className="text-xs">
            Experiment · {formatPlanningNumber(total)}/min · {snapshot.sources.length} suppliers →{" "}
            {snapshot.destinations.length} consumers. Your plan stays unchanged.
          </DialogDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-y px-4 py-3">
          <ButtonGroup aria-label="Distribution layout">
            {(["balanced", "manifold"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant="outline"
                aria-pressed={mode === value}
                className={mode === value ? "bg-muted" : ""}
                onClick={() => {
                  setError(null);
                  setMode(value);
                }}
              >
                {value === "balanced" ? "Balanced" : "Manifold"}
              </Button>
            ))}
          </ButtonGroup>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Maximum belt tier</span>
            <ButtonGroup aria-label="Maximum belt tier">
              {PREVIEW_BELTS.map((capacity, index) => (
                <Button
                  key={capacity}
                  size="sm"
                  variant="outline"
                  aria-pressed={tier === index + 1}
                  aria-label={`Mk.${index + 1}: ${capacity}/min`}
                  title={`${capacity}/min`}
                  className={tier === index + 1 ? "bg-muted px-2" : "px-2"}
                  onClick={() => {
                    setError(null);
                    setTier(index + 1);
                  }}
                >
                  Mk.{index + 1}
                </Button>
              ))}
            </ButtonGroup>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {scene.graph.error || error ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {scene.graph.error ?? error}
            </div>
          ) : (
            <div ref={setHost} className="absolute inset-0" />
          )}
          {!scene.graph.error && !error && readyScene !== scene && (
            <output className="absolute inset-0 flex items-center justify-center bg-background text-sm text-muted-foreground">
              Arranging distribution…
            </output>
          )}
          {!scene.graph.error && !error && readyScene === scene && (
            <ButtonGroup
              aria-label="Preview zoom"
              className="absolute bottom-3 left-3 rounded-lg bg-background shadow-sm"
            >
              <Button
                variant="outline"
                size="icon"
                aria-label="Zoom preview out"
                title="Zoom out (−)"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => scene.controller.command("zoom-out")}
              >
                <MinusIcon />
              </Button>
              <Button
                variant="outline"
                className="tabular-nums"
                aria-label={`Preview zoom ${Math.round(zoom * 100)}%. Restore 100%`}
                title="Restore 100%"
                onClick={() => scene.controller.command("actual-size")}
              >
                {Math.round(zoom * 100)}%
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Zoom preview in"
                title="Zoom in (+)"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => scene.controller.command("zoom-in")}
              >
                <PlusIcon />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Fit preview"
                title="Fit preview"
                onClick={() => scene.controller.command("fit")}
              >
                <MaximizeIcon />
              </Button>
            </ButtonGroup>
          )}
        </div>
        <div className="shrink-0 space-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
          <div
            aria-label="Belt color legend"
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            {legend.map(({ tier: beltTier, capacity, style }) => (
              <span
                key={beltTier}
                className="inline-flex items-center gap-1.5"
                title={`${capacity} items/min`}
              >
                <span className="w-5 border-t-2" style={style} />
                Mk.{beltTier}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 border-t-2 border-dashed border-current" />
              Feedback
            </span>
          </div>
          {!scene.graph.error && (
            <p>
              {splitters} splitters · {mergers} mergers · {scene.graph.edges.length} belts
            </p>
          )}
          <p>
            {mode === "balanced"
              ? "Equal splits and mergers deliver the shown rates. Return belts recirculate spare shares; their capacity is included."
              : "Rates shown are steady-state targets. Consumer buffers must fill before surplus continues down the manifold."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
