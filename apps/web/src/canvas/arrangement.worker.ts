import ELK from "elkjs/lib/elk-api.js";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker";
import { arrangeCanvas } from "./auto-layout";
import type { CanvasDocument } from "./document";

// All our placement, routing, and spacing passes run here. ELK uses its
// supported worker API in a child worker; terminating this worker also closes
// its owned child, so cancellation stops the entire calculation.
self.onmessage = async (
  event: MessageEvent<{
    document: CanvasDocument;
    topology: "aggregate" | "physical";
  }>,
) => {
  const worker = new ElkWorker();
  try {
    const elk = new ELK({
      workerFactory: () => worker,
      algorithms: ["layered"],
    });
    const result = await arrangeCanvas(
      event.data.document,
      elk,
      event.data.topology,
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Auto-arrange failed.",
    });
  } finally {
    worker.terminate();
  }
};
