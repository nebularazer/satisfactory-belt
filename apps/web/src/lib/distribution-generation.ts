/** One cancellable worker per construction; no retained search state between previews. */
import type { DistributionRequest, DistributionResult } from "@satisfactory-belt/factory-core";

import DistributionWorker from "./distribution.worker?worker";

export type DistributionWorkerResponse = { result: DistributionResult } | { error: string };

export function generateDistribution(
  request: DistributionRequest,
  signal: AbortSignal,
): Promise<DistributionResult> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new DistributionWorker();
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
      worker.removeEventListener("message", completed);
      worker.removeEventListener("error", failed);
      worker.removeEventListener("messageerror", unreadable);
      worker.terminate();
    };
    const fail = (reason: unknown) => {
      cleanup();
      reject(reason);
    };
    const abort = () => fail(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const completed = ({ data }: MessageEvent<DistributionWorkerResponse>) => {
      cleanup();
      if ("error" in data) reject(new Error(data.error));
      else resolve(data.result);
    };
    const failed = (event: Event) => {
      event.preventDefault();
      fail(
        new Error(
          "Distribution generation could not start. Close and reopen the preview to retry.",
        ),
      );
    };
    const unreadable = () =>
      fail(
        new Error(
          "The distribution worker returned an unreadable result. Close and reopen the preview to retry.",
        ),
      );
    worker.addEventListener("message", completed);
    worker.addEventListener("error", failed);
    worker.addEventListener("messageerror", unreadable);
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated worker messages have no target origin.
      worker.postMessage(request);
    } catch (reason) {
      fail(reason);
    }
  });
}
