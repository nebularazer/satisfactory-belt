import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createNode } from "@satisfactory-belt/production";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createCanvasEditor } from "@/canvas/editor";

import { NodeInspector } from "./node-inspector";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterAll(() => vi.unstubAllGlobals());
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
    expect(clockSpeed).toHaveValue("");
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

  it("stays hidden while a selected node is moving", () => {
    const editor = createProcessEditor();
    render(<NodeInspector editor={editor} />);

    act(() => {
      editor.dispatch({ type: "selection.move.begin" });
      editor.dispatch({
        type: "selection.move.update",
        delta: { x: 20, y: 0 },
      });
    });

    expect(screen.queryByLabelText("Node details: Iron Plate")).toBeNull();
    act(() => editor.dispatch({ type: "selection.move.cancel" }));
    expect(screen.getByLabelText("Node details: Iron Plate")).toBeVisible();
  });

  it("dismisses the mobile sheet when its handle is dragged down", () => {
    const editor = createProcessEditor();
    render(<NodeInspector editor={editor} />);
    const handle = screen.getByRole("button", {
      name: "Drag down to close node details",
    });

    fireEvent.pointerDown(handle, { button: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 190, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 190, pointerId: 1 });

    expect(screen.queryByLabelText("Node details: Iron Plate")).toBeNull();
  });

  it("switches miner tiers without replacing the resource", () => {
    const editor = createCanvasEditor();
    editor.dispatch({
      type: "node.create",
      at: { x: 100, y: 100 },
      label: "Iron Ore",
      node: {
        buildableId: "Build_MinerMk1_C",
        kind: "process",
        processId: "extraction:Desc_OreIron_C",
      },
    });
    render(<NodeInspector editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Mk.2" }));

    expect(editor.getState().document.nodes[0]?.configuration).toMatchObject({
      buildableId: "Build_MinerMk2_C",
      processId: "extraction:Desc_OreIron_C",
    });
    expect(screen.queryByText("Rates")).toBeNull();
    expect(screen.queryByText("None")).toBeNull();
  });

  it("reorders recipe inputs for both the inspector and node card", () => {
    const editor = createCanvasEditor();
    editor.dispatch({
      type: "node.create",
      at: { x: 100, y: 100 },
      label: "Nitro Rocket Fuel",
      node: {
        buildableId: "Build_Blender_C",
        kind: "process",
        processId: "Recipe_Alternate_RocketFuel_Nitro_C",
      },
    });
    const configuration = editor.getState().document.nodes[0]!.configuration;
    const initialOrder = createNode(configuration)
      .ports.filter((port) => port.direction === "input")
      .map((port) => port.id);
    render(<NodeInspector editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Move Fuel down" }));

    expect(editor.getState().document.nodes[0]?.portOrder?.input).toEqual([
      initialOrder[1],
      initialOrder[0],
      ...initialOrder.slice(2),
    ]);
  });

  it("configures smart splitter output rules", () => {
    const editor = createCanvasEditor();
    editor.dispatch({
      type: "node.create",
      at: { x: 100, y: 100 },
      label: "Smart Splitter",
      node: {
        buildableId: "Build_ConveyorAttachmentSplitterSmart_C",
        kind: "router",
      },
    });
    render(<NodeInspector editor={editor} />);

    fireEvent.click(screen.getByRole("button", { name: "Top output rule" }));
    fireEvent.click(screen.getByText("Overflow"));

    expect(editor.getState().document.nodes[0]?.routerRules).toMatchObject({
      "output:1": ["overflow"],
    });
  });

  it("configures each Priority Merger input independently", () => {
    const editor = createCanvasEditor();
    editor.dispatch({
      type: "node.create",
      at: { x: 100, y: 100 },
      label: "Priority Merger",
      node: {
        buildableId: "Build_ConveyorAttachmentMergerPriority_C",
        kind: "router",
      },
    });
    render(<NodeInspector editor={editor} />);

    fireEvent.click(
      within(screen.getByRole("group", { name: "Top input" })).getByRole(
        "button",
        { name: "High" },
      ),
    );

    expect(editor.getState().document.nodes[0]?.routerPriorities).toMatchObject(
      {
        "input:1": "high",
      },
    );
  });
});
