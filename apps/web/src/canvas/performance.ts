export type TimingSummary = Readonly<{
  averageMs: number;
  maximumMs: number;
  p95Ms: number;
}>;

export type CanvasPerformanceMetrics = Readonly<{
  fps: number | null;
  render: TimingSummary;
  update: TimingSummary;
  visibleNodes: number;
}>;

const ACTIVE_FRAME_GAP_MS = 100;
const SAMPLE_INTERVAL_MS = 1_000;

function summarize(samples: readonly number[]): TimingSummary {
  if (samples.length === 0) {
    return { averageMs: 0, maximumMs: 0, p95Ms: 0 };
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    averageMs: samples.reduce((total, sample) => total + sample, 0) /
      samples.length,
    maximumMs: sorted.at(-1) ?? 0,
    p95Ms: sorted[p95Index] ?? 0,
  };
}

export function createPerformanceSampler(
  report: (metrics: CanvasPerformanceMetrics) => void,
) {
  let frameIntervals: number[] = [];
  let lastRenderAt: number | undefined;
  let renderSamples: number[] = [];
  let sampleStartedAt: number | undefined;
  let updateSamples: number[] = [];
  let visibleNodes = 0;

  const emit = () => {
    const averageFrameInterval = frameIntervals.length > 0
      ? frameIntervals.reduce((total, interval) => total + interval, 0) /
        frameIntervals.length
      : undefined;

    report({
      fps: averageFrameInterval
        ? 1000 / averageFrameInterval
        : null,
      render: summarize(renderSamples),
      update: summarize(updateSamples),
      visibleNodes,
    });
    frameIntervals = [];
    renderSamples = [];
    updateSamples = [];
  };

  return {
    recordRender(now: number, renderTimeMs: number, visibleNodeCount = 0) {
      const frameInterval = lastRenderAt === undefined
        ? undefined
        : now - lastRenderAt;
      const startedActiveWindow =
        frameInterval === undefined || frameInterval > ACTIVE_FRAME_GAP_MS;

      if (startedActiveWindow) {
        frameIntervals = [];
        renderSamples = [];
        sampleStartedAt = now;
      } else {
        frameIntervals.push(frameInterval);
      }

      lastRenderAt = now;
      renderSamples.push(renderTimeMs);
      visibleNodes = visibleNodeCount;

      if (startedActiveWindow) {
        emit();
        sampleStartedAt = now;
      } else if (
        sampleStartedAt !== undefined &&
        now - sampleStartedAt >= SAMPLE_INTERVAL_MS
      ) {
        emit();
        sampleStartedAt = now;
      }
    },
    recordUpdate(updateTimeMs: number) {
      updateSamples.push(updateTimeMs);
    },
    reset() {
      frameIntervals = [];
      lastRenderAt = undefined;
      renderSamples = [];
      sampleStartedAt = undefined;
      updateSamples = [];
      visibleNodes = 0;
    },
  };
}
