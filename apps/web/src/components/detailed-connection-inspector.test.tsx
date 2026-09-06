import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { generateDetailedPlan } from "@satisfactory-belt/planning";
import { afterEach, describe, expect, it } from "vitest";

import { detailedPlanToCanvasDocument } from "@/canvas/plan-adapters";
import { createDetailedCanvasEditor } from "@/detailed-canvas/editor";

import { DetailedConnectionInspector } from "./detailed-connection-inspector";

afterEach(cleanup);

describe("DetailedConnectionInspector", () => {
  it("shows flow details and changes the selected belt tier", () => {
    const { plan } = generateDetailedPlan({
      outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
    });
    const editor = createDetailedCanvasEditor(
      detailedPlanToCanvasDocument(plan),
    );
    const connection = editor
      .getState()
      .document.connections.find(({ kind }) => kind === "conveyor")!;
    editor.dispatch({
      type: "selection.set",
      connectionIds: [connection.id],
    });
    render(<DetailedConnectionInspector editor={editor} />);

    expect(
      screen.getByRole("complementary", { name: "Conveyor details" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Belt tier" }), {
      target: { value: "conveyor-mk5" },
    });
    expect(
      editor
        .getState()
        .document.connections.find(({ id }) => id === connection.id),
    ).toMatchObject({ tierId: "conveyor-mk5" });
  });
});
