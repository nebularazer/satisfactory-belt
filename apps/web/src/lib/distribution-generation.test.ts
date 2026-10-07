import type { DistributionRequest } from "@satisfactory-belt/factory-core";
import { beforeEach, expect, it, vi } from "vitest";

import { generateDistribution } from "./distribution-generation";

const harness = vi.hoisted(() => {
  class Worker extends EventTarget {
    static instances: Worker[] = [];
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      super();
      Worker.instances.push(this);
    }
  }
  return { Worker };
});
vi.mock("./distribution.worker?worker", () => ({ default: harness.Worker }));
beforeEach(() => {
  harness.Worker.instances = [];
});
const request: DistributionRequest = {
  sources: [{ id: "s", rate: 60 }],
  destinations: [{ id: "d", rate: 60 }],
  maxTier: 1,
  transport: "belt",
};

it("returns the worker result and releases the worker and abort listener", async () => {
  const abort = new AbortController();
  const pending = generateDistribution(request, abort.signal);
  const worker = harness.Worker.instances[0]!;
  expect(worker.postMessage).toHaveBeenCalledWith(request);
  const result = { nodes: [], edges: [], error: "Unsupported", errorCode: "unsupported" };
  worker.dispatchEvent(new MessageEvent("message", { data: { result } }));
  expect(await pending).toEqual(result);
  expect(worker.terminate).toHaveBeenCalledOnce();
  abort.abort();
  expect(worker.terminate).toHaveBeenCalledOnce();
  worker.dispatchEvent(new MessageEvent("message", { data: { error: "Late result" } }));
  expect(worker.terminate).toHaveBeenCalledOnce();
});

it("rejects pending generation and terminates its worker on cancellation", async () => {
  const abort = new AbortController();
  const pending = generateDistribution(request, abort.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  abort.abort();
  await rejected;
  expect(harness.Worker.instances[0]!.terminate).toHaveBeenCalledOnce();
});

it("does not start a worker for an already cancelled request", () => {
  const abort = new AbortController();
  abort.abort();
  expect(() => generateDistribution(request, abort.signal)).toThrow();
  expect(harness.Worker.instances).toHaveLength(0);
});

it.each(["error", "messageerror", "reported"] as const)(
  "releases the worker after a %s failure",
  async (kind) => {
    const pending = generateDistribution(request, new AbortController().signal);
    const worker = harness.Worker.instances[0]!;
    const rejected = expect(pending).rejects.toThrow();
    if (kind === "error") worker.dispatchEvent(new Event("error"));
    else if (kind === "messageerror") worker.dispatchEvent(new Event("messageerror"));
    else
      worker.dispatchEvent(new MessageEvent("message", { data: { error: "Generation failed" } }));
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  },
);
