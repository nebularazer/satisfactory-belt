export type CanvasPerformanceMetrics = Readonly<{
  fps: number;
  frameTimeMs: number;
}>;

const SAMPLE_INTERVAL_MS = 250;

export function createPerformanceSampler(
  report: (metrics: CanvasPerformanceMetrics) => void,
) {
  let elapsedFrameTime = 0;
  let frameCount = 0;
  let sampleStartedAt: number | undefined;

  return {
    addFrame(now: number, frameTimeMs: number) {
      sampleStartedAt ??= now - frameTimeMs;
      elapsedFrameTime += frameTimeMs;
      frameCount += 1;

      if (now - sampleStartedAt < SAMPLE_INTERVAL_MS) return;

      const averageFrameTime = elapsedFrameTime / frameCount;
      report({
        fps: averageFrameTime > 0 ? 1000 / averageFrameTime : 0,
        frameTimeMs: averageFrameTime,
      });
      elapsedFrameTime = 0;
      frameCount = 0;
      sampleStartedAt = now;
    },
    reset() {
      elapsedFrameTime = 0;
      frameCount = 0;
      sampleStartedAt = undefined;
    },
  };
}
