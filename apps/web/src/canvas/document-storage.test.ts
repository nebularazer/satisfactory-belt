import { describe, expect, it, vi } from "vitest";

import { attachCanvasAutosave, type CanvasDocumentStorage } from "./document-storage";
import { createCanvasEditor } from "./editor";

describe("canvas autosave", () => {
  it("debounces document changes and flushes the latest document", async () => {
    vi.useFakeTimers();
    const save = vi.fn<CanvasDocumentStorage["save"]>().mockResolvedValue();
    const editor = createCanvasEditor({ idFactory: () => crypto.randomUUID() });
    const detach = attachCanvasAutosave(editor, { load: async () => null, save });

    editor.dispatch({ type: "node.create", at: { x: 0, y: 0 } });
    editor.dispatch({ type: "node.create", at: { x: 100, y: 100 } });
    await vi.advanceTimersByTimeAsync(300);

    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0].nodes).toHaveLength(2);
    detach();
    vi.useRealTimers();
  });
});
