import GenerationWorker from "./generation.worker?worker";
import { requestCanvasArrangement } from "@/canvas/auto-layout-request";
import type { generateProduction } from "./generate-production";
import type { AutoBuildSettings } from "./production-request";

export type AutoBuildResult = ReturnType<typeof generateProduction>;
export type AutoBuildStage = "Generating production" | "Arranging machines";

function generate(
  settings: AutoBuildSettings,
  signal: AbortSignal,
): Promise<AutoBuildResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const worker = new GenerationWorker();
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
            "Generation took too long. Try fewer outputs or lower rates.",
          ),
        ),
      60_000,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onerror = () =>
      fail(new Error("Generation could not start. Please try again."));
    worker.onmessage = (
      event: MessageEvent<{ result?: AutoBuildResult; error?: string }>,
    ) => {
      if (event.data.result) {
        cleanup();
        resolve(event.data.result);
      } else fail(new Error(event.data.error ?? "Generation failed."));
    };
    try {
      worker.postMessage(settings);
    } catch (error) {
      fail(error instanceof Error ? error : new Error("Generation failed."));
    }
  });
}

export async function requestAutoBuild(
  settings: AutoBuildSettings,
  signal: AbortSignal,
  onStage: (stage: AutoBuildStage) => void,
): Promise<AutoBuildResult> {
  onStage("Generating production");
  const result = await generate(settings, signal);
  onStage("Arranging machines");
  return {
    ...result,
    document: await requestCanvasArrangement(result.document, signal),
  };
}
