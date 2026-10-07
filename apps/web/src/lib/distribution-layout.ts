/** Worker-backed layout for the distribution preview. */
import ELK from "elkjs/lib/elk-api";
import type { ElkNode } from "elkjs/lib/elk-api";

import ElkWorker from "./distribution-elk.worker?worker";

export async function layoutDistribution(graph: ElkNode, signal: AbortSignal) {
  signal.throwIfAborted();
  const worker = new ElkWorker();
  const elk = new ELK({ workerFactory: () => worker });
  let rejectLayout: ((reason: unknown) => void) | undefined;
  const stop = () => rejectLayout?.(signal.reason);
  const failed = (event: Event) => {
    event.preventDefault();
    rejectLayout?.(new Error("Distribution layout failed. Close and reopen the preview to retry."));
  };
  signal.addEventListener("abort", stop, { once: true });
  worker.addEventListener("error", failed);
  worker.addEventListener("messageerror", failed);
  try {
    const result = await new Promise<ElkNode>((resolve, reject) => {
      rejectLayout = reject;
      void elk.layout(graph).then(resolve, reject);
    });
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener("abort", stop);
    worker.removeEventListener("error", failed);
    worker.removeEventListener("messageerror", failed);
    elk.terminateWorker();
  }
}
