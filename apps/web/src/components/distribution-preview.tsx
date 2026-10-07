/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Local distribution-preview controls. */
import { MAX_ZOOM, MIN_ZOOM } from "@satisfactory-belt/canvas-core";
import type { PortReference } from "@satisfactory-belt/canvas-core";
/** Construction preview with a local, rearrangeable layout. */
import { distributionCapacities, formatPlanningNumber } from "@satisfactory-belt/factory-core";
import { MaximizeIcon, MinusIcon, PlusIcon, WorkflowIcon } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DISTRIBUTION_BELT_COLORS,
  distributionRequest,
  distributionScene,
  distributionSnapshot,
} from "@/lib/distribution";
import type { DistributionDetail, DistributionSnapshot } from "@/lib/distribution";
import { generateDistribution } from "@/lib/distribution-generation";
import type { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";

const legends = {
  belt: distributionCapacities("belt").map((capacity, index) => ({
    tier: index + 1,
    capacity,
    style: { borderColor: `#${DISTRIBUTION_BELT_COLORS[index]!.toString(16).padStart(6, "0")}` },
  })),
  pipe: distributionCapacities("pipe").map((capacity, index) => ({
    tier: index + 1,
    capacity,
    style: { borderColor: `#${DISTRIBUTION_BELT_COLORS[index]!.toString(16).padStart(6, "0")}` },
  })),
};
const subscribeIdle = () => () => {};
const idleZoom = () => 1;

type PreviewSnapshots = Record<DistributionDetail, DistributionSnapshot>;

export function DistributionPreview({
  port,
  editor,
  assets,
}: {
  port: PortReference;
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
}) {
  const [snapshots, setSnapshots] = useState<PreviewSnapshots | null>(null);
  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        onClick={() =>
          setSnapshots({
            nodes: distributionSnapshot(editor, assets, port),
            machines: distributionSnapshot(editor, assets, port, "machines"),
          })
        }
      >
        <WorkflowIcon />
        Preview distribution…
      </Button>
      {snapshots && (
        <Preview snapshots={snapshots} assets={assets} close={() => setSnapshots(null)} />
      )}
    </>
  );
}

function Preview({
  snapshots,
  assets,
  close,
}: {
  snapshots: PreviewSnapshots;
  assets: GameAssets;
  close: () => void;
}) {
  const [detail, setDetail] = useState<DistributionDetail>("nodes");
  const snapshot = snapshots[detail];
  const pipes = snapshot.transport === "pipe";
  const capacities = distributionCapacities(snapshot.transport);
  const legend = legends[snapshot.transport];
  const unit = pipes ? " m³/min" : "/min";
  const maximumLabel = `Maximum ${snapshot.transport} tier`;
  const [tier, setTier] = useState<number | null>(null);
  const maximumTier = tier ?? (pipes ? 2 : 6);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const request = useMemo(
    () => distributionRequest(snapshot, maximumTier),
    [snapshot, maximumTier],
  );
  const [view, setView] = useState<{
    request: typeof request;
    scene?: ReturnType<typeof distributionScene>;
    error?: string;
  } | null>(null);
  const scene = view?.request === request ? view.scene : undefined;
  // Automatic selection reports the completed network, including recirculation,
  // without rebuilding it under a lower cap. Manual choices keep their cap.
  const selectedTier =
    tier ??
    (scene ? Math.max(1, ...scene.graph.edges.map((edge) => edge.tier)) : capacities.length);
  const error =
    "nodes" in request ? request.error : view?.request === request ? view.error : undefined;
  const zoom = useSyncExternalStore(
    scene?.controller.subscribe ?? subscribeIdle,
    scene ? () => scene.controller.getSnapshot().camera.zoom : idleZoom,
  );
  useEffect(() => {
    if (!host || "nodes" in request) return undefined;
    const abort = new AbortController();
    const run = async () => {
      const graph = await generateDistribution(request, abort.signal);
      abort.signal.throwIfAborted();
      if (graph.error) {
        setView({ request, error: graph.error });
        return;
      }
      const nextScene = distributionScene(snapshot, assets, graph);
      const [{ mountCanvas }] = await Promise.all([
        import("@satisfactory-belt/canvas-pixi"),
        nextScene.layout(abort.signal),
      ]);
      abort.signal.throwIfAborted();
      const canvas = await mountCanvas(host, nextScene.controller, {
        getDisplay: nextScene.getDisplay,
        getLinkRates: nextScene.getLinkRates,
        iconManifest: assets.icons,
        assetBaseUrl: assets.baseUrl,
        fontFamily: "Inter Variable",
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        signal: abort.signal,
      });
      abort.signal.throwIfAborted();
      nextScene.controller.command("fit");
      // Start readable; Fit remains available for the complete overview.
      if (nextScene.controller.getSnapshot().camera.zoom < 0.75) nextScene.controller.zoomTo(0.75);
      host
        .querySelector("canvas")
        ?.setAttribute(
          "aria-label",
          "Distribution preview. Drag nodes to rearrange; drag the background to pan, pinch or scroll to zoom.",
        );
      setView({ request, scene: nextScene });
      canvas.focus();
    };
    void run().catch((reason: unknown) => {
      if (!abort.signal.aborted) {
        setView({
          request,
          error:
            reason instanceof Error
              ? reason.message
              : "Distribution could not start. Close and reopen the preview to retry.",
        });
        // Tear down any layout worker or partially mounted canvas on failure.
        abort.abort();
      }
    });
    return () => abort.abort();
  }, [request, snapshot, assets, host]);
  const splitters = scene?.graph.nodes.filter((n) => n.kind === "splitter").length ?? 0;
  const mergers = scene?.graph.nodes.filter((n) => n.kind === "merger").length ?? 0;
  const tees = scene?.graph.nodes.filter((n) => n.junctionType === "t").length ?? 0;
  const crosses = scene?.graph.nodes.filter((n) => n.junctionType === "cross").length ?? 0;
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
            {formatPlanningNumber(total)}
            {unit} · {snapshot.sources.length} suppliers → {snapshot.destinations.length} consumers.
            Drag nodes to rearrange. Your plan stays unchanged.
          </DialogDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-y px-4 py-3">
          <ButtonGroup aria-label="Distribution detail">
            {(["nodes", "machines"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant="outline"
                aria-pressed={detail === value}
                className={detail === value ? "bg-muted" : ""}
                onClick={() => {
                  setDetail(value);
                }}
              >
                {value === "nodes" ? "Connected nodes" : "Individual machines"}
              </Button>
            ))}
          </ButtonGroup>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{maximumLabel}</span>
            <ButtonGroup aria-label={maximumLabel}>
              {capacities.map((capacity, index) => (
                <Button
                  key={capacity}
                  size="sm"
                  variant="outline"
                  aria-pressed={selectedTier === index + 1}
                  aria-label={`Mk.${index + 1}: ${capacity}${unit}`}
                  title={`${capacity}${unit}`}
                  className={selectedTier === index + 1 ? "bg-muted px-2" : "px-2"}
                  onClick={() => {
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
          <div ref={setHost} className="absolute inset-0" aria-hidden={Boolean(error)} />
          {error ? (
            <div
              role="alert"
              className="absolute inset-0 flex items-center justify-center bg-background p-6 text-center text-sm text-muted-foreground"
            >
              {error}
            </div>
          ) : !scene ? (
            <output className="absolute inset-0 flex items-center justify-center bg-background text-sm text-muted-foreground">
              Planning distribution…
            </output>
          ) : null}
          {!error && scene && (
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
            aria-label={pipes ? "Pipe color legend" : "Belt color legend"}
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            {legend.map(({ tier: beltTier, capacity, style }) => (
              <span
                key={beltTier}
                className="inline-flex items-center gap-1.5"
                title={`${capacity}${pipes ? " m³" : " items"}/min`}
              >
                <span className="w-5 border-t-2" style={style} />
                Mk.{beltTier}
              </span>
            ))}
            {!pipes && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-5 border-t-2 border-dashed border-current" />
                Return flow
              </span>
            )}
          </div>
          {scene && (
            <p>
              {pipes
                ? `${tees} T-junctions · ${crosses} cross-junctions · ${scene.graph.edges.length} pipes`
                : `${splitters} splitters · ${mergers} mergers · ${scene.graph.edges.length} belts`}
            </p>
          )}
          <p>
            {pipes
              ? `Junction connections allow flow in either direction. Rates show planned net flow, not fixed splits. ${assets.catalog.items[snapshot.itemId]?.form === "gas" ? "Pipe filling is" : "Pipe filling and head lift are"} not simulated.`
              : "Equal splits and mergers deliver the shown rates. Return belts recirculate spare shares; their capacity is included."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
