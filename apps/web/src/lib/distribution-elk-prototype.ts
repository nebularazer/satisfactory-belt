/** Worker-backed layout for the isolated distribution experiment. */
import ELK from "elkjs/lib/elk-api";
import type { ElkNode } from "elkjs/lib/elk-api";

import ElkWorker from "./distribution-elk.worker?worker";

export async function layoutDistribution(graph: ElkNode, signal: AbortSignal) {
  signal.throwIfAborted();
  const elk = new ELK({ workerFactory: () => new ElkWorker() });
  const stop = () => elk.terminateWorker();
  signal.addEventListener("abort", stop, { once: true });
  try {
    const result = await elk.layout(graph);
    signal.throwIfAborted();
    return result;
  } finally {
    signal.removeEventListener("abort", stop);
    stop();
  }
}
