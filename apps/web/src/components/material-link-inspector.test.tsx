import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createCanvasEditor } from "@/canvas/editor";

import { MaterialLinkInspector } from "./material-link-inspector";

afterEach(cleanup);

function linkedEditor(consumerCount = 1) {
  let id = 0;
  const editor = createCanvasEditor({ idFactory: () => `node-${++id}` });
  editor.dispatch({
    type: "node.create",
    at: { x: 0, y: 0 },
    label: "Smelter",
    node: {
      buildableId: "Build_SmelterMk1_C",
      kind: "process",
      processId: "Recipe_IngotIron_C",
    },
  });
  editor.dispatch({
    type: "node.create",
    at: { x: 400, y: 0 },
    label: "Constructor",
    node: {
      buildableId: "Build_ConstructorMk1_C",
      instances: Array.from({ length: consumerCount }, (_, index) => ({
        id: `constructor-${index + 1}`,
      })),
      kind: "process",
      processId: "Recipe_IronPlate_C",
    },
  });
  editor.dispatch({
    type: "link.create",
    from: { nodeId: "node-1", portId: "output:Desc_IronIngot_C" },
    id: "ingots",
    to: { nodeId: "node-2", portId: "input:Desc_IronIngot_C" },
  });
  return editor;
}

describe("MaterialLinkInspector", () => {
  it("shows flow details and disconnects the selected Material Link", () => {
    const editor = linkedEditor();
    render(<MaterialLinkInspector editor={editor} />);

    expect(
      screen.getByRole("complementary", {
        name: "Material Link details: Iron Ingot",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("30 items/min")).toBeInTheDocument();
    expect(screen.getByText("Balanced")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Iron Ingot" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Output · Iron Ingot")).toBeInTheDocument();
    expect(screen.getByText("Iron Plate")).toBeInTheDocument();
    expect(screen.getByText("Input · Iron Ingot")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(editor.getState().document.materialLinks).toEqual([]);
  });

  it("explains an undersupplied link without exposing descriptor ids", () => {
    render(<MaterialLinkInspector editor={linkedEditor(7)} />);

    expect(screen.getByText("Undersupplied")).toBeInTheDocument();
    expect(
      screen.getByText("Demand exceeds available supply by 180 items/min."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Desc_IronIngot_C")).not.toBeInTheDocument();
  });
});
