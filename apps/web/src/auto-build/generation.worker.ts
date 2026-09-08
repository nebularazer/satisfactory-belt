import { generateProduction } from "./generate-production";
import type { AutoBuildSettings } from "./production-request";

self.onmessage = (event: MessageEvent<AutoBuildSettings>) => {
  try {
    self.postMessage({ result: generateProduction(event.data) });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "The production plan could not be generated.",
    });
  }
};
