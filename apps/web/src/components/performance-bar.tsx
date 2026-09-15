import type { RenderPerformance } from "@satisfactory-belt/canvas-pixi";
import { useSyncExternalStore } from "react";

export function PerformanceBar({ monitor }: { monitor: RenderPerformance }) {
  const { rendersPerSecond, cpuMilliseconds, visibleItems, totalItems } = useSyncExternalStore(
    monitor.subscribe,
    monitor.getSnapshot,
  );
  return (
    <aside
      aria-label="Canvas performance"
      className="absolute bottom-[calc(max(1rem,env(safe-area-inset-bottom))+3rem)] left-1/2 flex h-8 -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-lg border bg-background px-3 text-xs text-muted-foreground shadow-sm tabular-nums lg:bottom-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <span title="Actual canvas renders per second; zero when the canvas is idle">
        {rendersPerSecond} renders/s
      </span>
      <span title="Average CPU time for scene updates and render submission in the last 250 ms; zero when no frames rendered">
        {cpuMilliseconds.toFixed(1)} ms CPU
      </span>
      <span title="Visible items / total items">
        {visibleItems}/{totalItems} items
      </span>
    </aside>
  );
}
