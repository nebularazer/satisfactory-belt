import type { CanvasDocument } from "@/canvas/document";
import { convertDetailed, type ConversionSettings } from "./convert";

self.onmessage = (
  event: MessageEvent<{
    document: CanvasDocument;
    settings: ConversionSettings;
  }>,
) => {
  try {
    const result = convertDetailed(
      event.data.document,
      event.data.settings,
      (stage) => self.postMessage({ stage }),
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "The Detailed plan could not be created.",
    });
  }
};
