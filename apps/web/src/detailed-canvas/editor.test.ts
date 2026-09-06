import {
  generateDetailedPlan,
  type DetailedPlan,
} from "@satisfactory-belt/planning";
import { describe, expect, it, vi } from "vitest";

import { detailedPlanToCanvasDocument } from "@/canvas/plan-adapters";

import {
  createDetailedCanvasEditor,
  presentDetailedConnections,
} from "./editor";

function generatedEditor() {
  const { plan } = generateDetailedPlan({
    outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
  });
  return createDetailedCanvasEditor(detailedPlanToCanvasDocument(plan));
}

describe("Detailed canvas editor", () => {
  it("keeps geometry-only movement off the analysis path", () => {
    const editor = generatedEditor();
    const before = editor.getState();
    const id = before.document.nodes[0]!.configuration.id;
    editor.dispatch({
      type: "node.move",
      delta: { x: 32, y: 16 },
      ids: [id],
    });
    expect(editor.getState().analysisRevision).toBe(before.analysisRevision);
    expect(editor.getState().document.nodes[0]).toMatchObject({ x: 32, y: 16 });
  });

  it("schedules exactly one affected-region revision for a tier change", () => {
    const { plan } = generateDetailedPlan({
      outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
    });
    const analyze = vi.fn(
      (
        _plan: DetailedPlan,
        _change?: Readonly<{
          connectionIds?: readonly string[];
          nodeIds?: readonly string[];
        }>,
      ) => 9,
    );
    const editor = createDetailedCanvasEditor(
      detailedPlanToCanvasDocument(plan),
      { analyze },
    );
    const connection = editor.getState().document.connections[0]!;
    editor.dispatch({
      type: "connection.tier",
      id: connection.id,
      tierId: "conveyor-mk5",
    });
    expect(analyze).toHaveBeenCalledOnce();
    expect(analyze.mock.calls[0]?.[1]).toEqual({
      connectionIds: [connection.id],
    });
    expect(editor.getState().analysisRevision).toBe(9);
  });

  it("presents tier, utilization, carried Descriptors, and diagnostics", () => {
    const editor = generatedEditor();
    const state = editor.getState();
    const presentation = presentDetailedConnections(
      state.document,
      state.analysis,
    );
    expect(presentation[0]).toEqual(
      expect.objectContaining({
        descriptorRates: expect.any(Array),
        direction: "forward",
        tier: expect.objectContaining({ medium: "conveyor" }),
        utilization: expect.any(Number),
      }),
    );
  });

  it("copies internal topology and deletes Nodes with incident connections", () => {
    const { plan } = generateDetailedPlan({
      outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
    });
    let sequence = 0;
    const editor = createDetailedCanvasEditor(
      detailedPlanToCanvasDocument(plan),
      undefined,
      () => `copy-${++sequence}`,
    );
    const original = editor.getState().document;
    const selectedNodeIds = original.nodes.map(
      ({ configuration }) => configuration.id,
    );
    editor.dispatch({ type: "selection.set", nodeIds: selectedNodeIds });
    editor.dispatch({ type: "selection.copy" });
    editor.dispatch({ type: "selection.paste" });
    expect(editor.getState().document.nodes).toHaveLength(
      original.nodes.length * 2,
    );
    expect(editor.getState().document.connections).toHaveLength(
      original.connections.length * 2,
    );

    const copiedNodeId = editor.getState().selectedNodeIds[0]!;
    editor.dispatch({ type: "node.delete", id: copiedNodeId });
    expect(
      editor
        .getState()
        .document.connections.some(
          ({ from, to }) =>
            from.nodeId === copiedNodeId || to.nodeId === copiedNodeId,
        ),
    ).toBe(false);
    editor.dispatch({ type: "history.undo" });
    expect(
      editor
        .getState()
        .document.nodes.some(
          ({ configuration }) => configuration.id === copiedNodeId,
        ),
    ).toBe(true);
  });
});
