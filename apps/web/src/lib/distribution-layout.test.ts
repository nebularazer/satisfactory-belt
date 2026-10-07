import { beforeEach, expect, it, vi } from "vitest";

import { layoutDistribution } from "./distribution-layout";

const harness = vi.hoisted(() => {
  class Worker extends EventTarget {
    static instances: Worker[] = [];
    terminate = vi.fn();
    constructor() {
      super();
      Worker.instances.push(this);
    }
  }
  return { Worker, layout: vi.fn<() => Promise<{ id: string }>>() };
});
vi.mock("./distribution-elk.worker?worker", () => ({ default: harness.Worker }));
vi.mock("elkjs/lib/elk-api", () => ({
  default: class {
    layout = harness.layout;
    terminateWorker() {
      harness.Worker.instances.at(-1)!.terminate();
    }
  },
}));
beforeEach(() => {
  harness.Worker.instances = [];
  harness.layout.mockReset();
});

it("settles and terminates a pending layout immediately on cancellation", async () => {
  harness.layout.mockReturnValue(new Promise(() => {}));
  const abort = new AbortController();
  const pending = layoutDistribution({ id: "distribution" }, abort.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  abort.abort();
  await rejected;
  expect(harness.Worker.instances[0]!.terminate).toHaveBeenCalledOnce();
});

it("does not create a layout worker for a cancelled request", async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(layoutDistribution({ id: "distribution" }, abort.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(harness.Worker.instances).toHaveLength(0);
});

it.each(["error", "messageerror"])("rejects a layout worker %s and releases it", async (kind) => {
  harness.layout.mockReturnValue(new Promise(() => {}));
  const pending = layoutDistribution({ id: "distribution" }, new AbortController().signal);
  const rejected = expect(pending).rejects.toThrow("layout failed");
  harness.Worker.instances[0]!.dispatchEvent(new Event(kind));
  await rejected;
  expect(harness.Worker.instances[0]!.terminate).toHaveBeenCalledOnce();
});

it("releases the worker after successful layout", async () => {
  const result = { id: "distribution" };
  harness.layout.mockResolvedValue(result);
  const abort = new AbortController();
  expect(await layoutDistribution(result, abort.signal)).toBe(result);
  abort.abort();
  expect(harness.Worker.instances[0]!.terminate).toHaveBeenCalledOnce();
});
