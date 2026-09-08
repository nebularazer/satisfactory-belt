import ConversionWorker from "./conversion.worker?worker";
import { requestCanvasArrangement } from "@/canvas/auto-layout-request";
import {
  detailedDocumentFromEditor,
  detailedDocumentToEditor,
} from "@/canvas/editor-mode";
import type { CanvasDocument } from "@/canvas/document";
import type { DetailedCanvasDocument } from "@/detailed-canvas/document";
import type { ConversionSettings, ConversionStage } from "./convert";

export async function requestDetailedConversion(
  document: CanvasDocument,
  settings: ConversionSettings,
  signal: AbortSignal,
  onStage: (stage: ConversionStage) => void,
): Promise<DetailedCanvasDocument> {
  const result = await new Promise<DetailedCanvasDocument>(
    (resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      const worker = new ConversionWorker();
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
        () =>
          fail(
            new Error(
              "Conversion took too long. Try a smaller production group.",
            ),
          ),
        60_000,
      );
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = () =>
        fail(new Error("Conversion could not start. Please try again."));
      worker.onmessage = (
        event: MessageEvent<{
          result?: DetailedCanvasDocument;
          stage?: ConversionStage;
          error?: string;
        }>,
      ) => {
        if (event.data.stage) onStage(event.data.stage);
        else if (event.data.result) {
          cleanup();
          resolve(event.data.result);
        } else fail(new Error(event.data.error ?? "Conversion failed."));
      };
      try {
        worker.postMessage({ document, settings });
      } catch (error) {
        fail(error instanceof Error ? error : new Error("Conversion failed."));
      }
    },
  );
  signal.throwIfAborted();
  onStage("Arranging factory");
  const arranged = await requestCanvasArrangement(
    detailedDocumentToEditor(result),
    signal,
  );
  signal.throwIfAborted();
  return detailedDocumentFromEditor(arranged, result.tiers);
}
