import ELK from "elkjs/lib/elk-api.js";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker";
import { arrangeCanvas } from "./auto-layout";
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
    const worker = new ElkWorker();
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
    try {
      const elk = new ELK({
        workerFactory: () => worker,
        algorithms: ["layered"],
      });
      void arrangeCanvas(document, elk, topology).then((result) => {
        cleanup();
        resolve(result);
      }, fail);
    } catch (error) {
      fail(error instanceof Error ? error : new Error("Auto-arrange failed."));
    }
  });
}
