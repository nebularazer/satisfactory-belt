import type { CanvasPerformanceMetrics } from "@/canvas/performance";

type PerformanceBarProps = {
  metrics: CanvasPerformanceMetrics | null;
  nodeCount: number;
  selectedCount: number;
};

type MetricProps = {
  label: string;
  title?: string;
  value: number | string;
};

function Metric({ label, title, value }: MetricProps) {
  return (
    <div className="flex h-8 items-center gap-1 px-2" title={title}>
      <span className="text-xs font-medium tabular-nums">{value}</span>
      <span className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Separator() {
  return <div aria-hidden="true" className="h-5 w-px bg-border" />;
}

export function PerformanceBar({
  metrics,
  nodeCount,
  selectedCount,
}: PerformanceBarProps) {
  const fps = Math.round(metrics?.fps ?? 0);
  const renderTime = metrics ? metrics.render.averageMs.toFixed(1) : "–";
  const updateTime = metrics ? metrics.update.averageMs.toFixed(1) : "–";
  const nodeLabel = nodeCount === 1 ? "node" : "nodes";

  return (
    <div
      aria-label={`Performance metrics: ${fps} FPS, ${updateTime} milliseconds updating, ${renderTime} milliseconds rendering, ${nodeCount} ${nodeLabel}, ${metrics?.visibleNodes ?? "unknown"} visible, ${selectedCount} selected`}
      className="flex h-[42px] max-w-[calc(100vw-1.5rem)] items-center overflow-x-auto rounded-xl border border-border bg-card px-1 shadow-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Metric label="FPS" value={fps} />
      <Separator />
      <Metric
        label="update"
        title={
          metrics
            ? `Editor and scene update: ${updateTime} ms average, ${metrics.update.p95Ms.toFixed(1)} ms p95, ${metrics.update.maximumMs.toFixed(1)} ms maximum`
            : "Editor and scene update time"
        }
        value={updateTime}
      />
      <Separator />
      <Metric
        label="render"
        title={
          metrics
            ? `CPU render submission: ${renderTime} ms average, ${metrics.render.p95Ms.toFixed(1)} ms p95, ${metrics.render.maximumMs.toFixed(1)} ms maximum`
            : "CPU render submission time"
        }
        value={renderTime}
      />
      <Separator />
      <Metric label="nodes" value={nodeCount} />
      <Separator />
      <Metric label="visible" value={metrics?.visibleNodes ?? "–"} />
      <Separator />
      <Metric label="selected" value={selectedCount} />
    </div>
  );
}
