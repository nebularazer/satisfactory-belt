import { afterEach, expect, it, vi } from "vitest";
import { EMPTY_CANVAS_DOCUMENT } from "./document";

const workers = vi.hoisted(() => [] as any[]);
vi.mock("./arrangement.worker?worker", () => ({
  default: class {
    postMessage = vi.fn();
    terminate = vi.fn();
    onmessage?: (event: unknown) => void;
    onerror?: () => void;
    constructor() {
      workers.push(this);
    }
  },
}));
import { requestCanvasArrangement } from "./auto-layout-request";
afterEach(() => {
  workers.length = 0;
  vi.useRealTimers();
});

it("sends the complete document and topology to the worker and cleans up on completion", async () => {
  const pending = requestCanvasArrangement(
    EMPTY_CANVAS_DOCUMENT,
    new AbortController().signal,
    "aggregate",
  );
  expect(workers[0].postMessage).toHaveBeenCalledWith({
    document: EMPTY_CANVAS_DOCUMENT,
    topology: "aggregate",
  });
  workers[0].onmessage({ data: { result: EMPTY_CANVAS_DOCUMENT } });
  await expect(pending).resolves.toEqual(EMPTY_CANVAS_DOCUMENT);
  expect(workers[0].terminate).toHaveBeenCalledOnce();
});

it("terminates the entire layout immediately on cancellation", async () => {
  const controller = new AbortController();
  const pending = requestCanvasArrangement(
    EMPTY_CANVAS_DOCUMENT,
    controller.signal,
    "physical",
  );
  const rejection = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  controller.abort();
  await rejection;
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  await expect(
    requestCanvasArrangement(
      EMPTY_CANVAS_DOCUMENT,
      controller.signal,
      "physical",
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(workers).toHaveLength(1);
});

it("terminates failed or timed-out calculations", async () => {
  vi.useFakeTimers();
  const failed = requestCanvasArrangement(
    EMPTY_CANVAS_DOCUMENT,
    new AbortController().signal,
    "physical",
  );
  workers[0].onmessage({ data: { error: "No clear route" } });
  await expect(failed).rejects.toThrow("No clear route");
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  const slow = requestCanvasArrangement(
    EMPTY_CANVAS_DOCUMENT,
    new AbortController().signal,
    "physical",
  );
  const rejection = expect(slow).rejects.toThrow("took too long");
  await vi.advanceTimersByTimeAsync(60_000);
  await rejection;
  expect(workers[1].terminate).toHaveBeenCalledOnce();
});
