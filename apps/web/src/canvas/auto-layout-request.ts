import ArrangementWorker from "./arrangement.worker?worker";
import type { CanvasDocument } from "./document";

export function requestCanvasArrangement(
  document: CanvasDocument,
  signal: AbortSignal,
  topology: "aggregate" | "physical",
): Promise<CanvasDocument> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const worker = new ArrangementWorker();
    const cleanup = () => {
      worker.terminate();
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const abort = () => fail(new DOMException("Cancelled", "AbortError"));
    const timeout = setTimeout(
      () => fail(new Error("Auto-arrange took too long. Try a smaller plan.")),
      60_000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () =>
      fail(new Error("Auto-arrange could not start. Please try again."));
    worker.onmessage = (
      event: MessageEvent<{ result?: CanvasDocument; error?: string }>,
    ) => {
      if (event.data.result) {
        cleanup();
        resolve(event.data.result);
      } else fail(new Error(event.data.error ?? "Auto-arrange failed."));
    };
    try {
      worker.postMessage({ document, topology });
    } catch (error) {
      fail(error instanceof Error ? error : new Error("Auto-arrange failed."));
    }
  });
}
