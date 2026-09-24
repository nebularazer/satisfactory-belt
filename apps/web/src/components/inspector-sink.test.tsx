import { createMachineMembers } from "@satisfactory-belt/factory-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";

import { createFactoryEditor } from "@/lib/factory-editor";
import { minerFlowFixture } from "@/test/flow-fixture";

import { InspectorSink } from "./inspector-sink";

it("edits an explicit sinking rate and clears it when returning to surplus", async () => {
  const { assets } = minerFlowFixture();
  assets.catalog.sinks.sink = {
    id: "sink",
    name: "AWESOME Sink",
    description: "",
    descriptorId: "sink",
    iconId: "iron",
    powerMegawatts: 30,
  };
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [
      { id: "sink", kind: "sink", sinkId: "sink", x: 0, y: 0, machines: createMachineMembers(1) },
    ],
    links: [],
  });
  function Harness() {
    useSyncExternalStore(editor.history.subscribe, editor.history.getSnapshot);
    const node = editor.getNode("sink");
    if (node?.kind !== "sink") throw new Error("Expected sink");
    return <InspectorSink node={node} editor={editor} assets={assets} />;
  }
  const user = userEvent.setup();
  render(<Harness />);
  expect(screen.getByRole("button", { name: "Surplus", pressed: true })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Rate" }));
  const input = screen.getByRole("spinbutton", { name: "Sinking rate" });
  await user.clear(input);
  await user.type(input, "10");
  await user.tab();
  expect(editor.getNode("sink")).toMatchObject({ sinkRate: { perMinute: 10 } });
  await user.click(screen.getByRole("button", { name: "Surplus" }));
  expect(editor.getNode("sink")).toMatchObject({ sinkRate: undefined });
  expect(screen.queryByRole("spinbutton", { name: "Sinking rate" })).toBeNull();
});
