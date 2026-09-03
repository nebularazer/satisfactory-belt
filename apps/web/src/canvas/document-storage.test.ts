import { describe, expect, it, vi } from "vitest";

import { attachCanvasAutosave, type CanvasDocumentStorage } from "./document-storage";
import { createCanvasEditor } from "./editor";

describe("canvas autosave", () => {
  it("debounces document changes and flushes the latest document", async () => {
    vi.useFakeTimers();
    const saveAutosave = vi
      .fn<CanvasDocumentStorage["saveAutosave"]>()
      .mockResolvedValue();
    const editor = createCanvasEditor({ idFactory: () => crypto.randomUUID() });
    const storage: CanvasDocumentStorage = {
      deleteNamed: async () => undefined,
      listNamed: async () => [],
      loadAutosave: async () => null,
      saveAutosave,
      saveNamed: async () => {
        throw new Error("Not implemented by this test double.");
      },
    };
    const detach = attachCanvasAutosave(editor, storage);

    editor.dispatch({ type: "node.create", at: { x: 0, y: 0 } });
    editor.dispatch({ type: "node.create", at: { x: 100, y: 100 } });
    await vi.advanceTimersByTimeAsync(300);

    expect(saveAutosave).toHaveBeenCalledOnce();
    expect(saveAutosave.mock.calls[0]?.[0].nodes).toHaveLength(2);
    detach();
    vi.useRealTimers();
  });
});
