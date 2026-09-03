type FrameRequest = (callback: FrameRequestCallback) => number;
type FrameCancel = (handle: number) => void;

export function createRenderScheduler(
  render: (timestamp: number) => void,
  requestFrame: FrameRequest = requestAnimationFrame,
  cancelFrame: FrameCancel = cancelAnimationFrame,
) {
  let frameHandle: number | undefined;

  return {
    cancel() {
      if (frameHandle === undefined) return;
      cancelFrame(frameHandle);
      frameHandle = undefined;
    },
    request() {
      if (frameHandle !== undefined) return;
      frameHandle = requestFrame((timestamp) => {
        frameHandle = undefined;
        render(timestamp);
      });
    },
  };
}
