import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createCanvasEditor } from "@/canvas/editor";

import { NodeInspector } from "./node-inspector";

afterEach(cleanup);

function createProcessEditor() {
  let id = 0;
  const editor = createCanvasEditor({ idFactory: () => `node-${++id}` });
  editor.dispatch({
    type: "node.create",
    at: { x: 100, y: 100 },
    label: "Iron Plate",
    node: {
      buildableId: "Build_ConstructorMk1_C",
      kind: "process",
      processId: "Recipe_IronPlate_C",
    },
  });
  const node = editor.getState().document.nodes[0]!;
  if (node.configuration.kind !== "process") throw new Error("process");
  editor.dispatch({
    type: "node.configure",
    configuration: {
      ...node.configuration,
      instances: [
        { ...node.configuration.instances[0]!, clockSpeedPercent: 100 },
        {
          ...node.configuration.instances[0]!,
          clockSpeedPercent: 50,
          id: "machine-2",
        },
      ],
    },
    id: node.configuration.id,
  });
  return editor;
}

function clockSpeeds(editor: ReturnType<typeof createProcessEditor>) {
  const configuration = editor.getState().document.nodes[0]!.configuration;
  if (configuration.kind !== "process") throw new Error("process");
  return configuration.instances.map((instance) =>
    "clockSpeedPercent" in instance ? instance.clockSpeedPercent : undefined,
  );
}

describe("NodeInspector", () => {
  it("edits all machines from the aggregate scope", () => {
    const editor = createProcessEditor();
    render(<NodeInspector editor={editor} />);

    const clockSpeed = screen.getByLabelText("Clock speed");
    expect(clockSpeed).toHaveValue(null);
    expect(clockSpeed).toHaveAttribute("placeholder", "Mixed");

    fireEvent.change(clockSpeed, { target: { value: "125" } });

    expect(clockSpeeds(editor)).toEqual([125, 125]);
  });

  it("edits only the selected individual machine", () => {
    const editor = createProcessEditor();
    render(<NodeInspector editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit machine 2" }));
    fireEvent.change(screen.getByLabelText("Clock speed"), {
      target: { value: "80" },
    });

    expect(clockSpeeds(editor)).toEqual([100, 80]);
  });

  it("closes when the selection is cleared", () => {
    const editor = createProcessEditor();
    render(<NodeInspector editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Close node details" }));

    expect(screen.queryByLabelText("Node details: Iron Plate")).toBeNull();
  });
});
