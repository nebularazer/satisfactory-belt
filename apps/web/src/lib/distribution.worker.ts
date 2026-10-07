import { buildDistribution } from "@satisfactory-belt/factory-core";
import type { DistributionRequest } from "@satisfactory-belt/factory-core";

import type { DistributionWorkerResponse } from "./distribution-generation";

self.addEventListener("message", ({ data }: MessageEvent<DistributionRequest>) => {
  let response: DistributionWorkerResponse;
  try {
    response = {
      result: buildDistribution(data.sources, data.destinations, data.maxTier, data.transport),
    };
  } catch {
    response = { error: "Distribution generation failed. Close and reopen the preview to retry." };
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated worker messages have no target origin.
  self.postMessage(response);
});
