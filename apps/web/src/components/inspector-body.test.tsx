import { createMachineMembers } from "@satisfactory-belt/factory-core";
import type { FacilityNode } from "@satisfactory-belt/factory-core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";

import { createFactoryEditor } from "@/lib/factory-editor";
import { inspectorAssets } from "@/test/inspector-fixture";

import { InspectorBody } from "./inspector-body";

it("applies the matrix switch to All or one member and omits unsupported clock/shard controls", async () => {
  const user = userEvent.setup();
  const assets = inspectorAssets();
  const node: FacilityNode = {
    id: "augmenter",
    x: 0,
    y: 0,
    kind: "facility",
    buildingId: "augmenter",
    configuration: { type: "augmenter" },
    machines: createMachineMembers(2).map((m, i) =>
      Object.assign(m, { suppliedMatrices: i === 0 }),
    ),
  };
  const editor = createFactoryEditor(assets.catalog, { nodes: [node], links: [] });
  function Harness() {
    const snapshot = useSyncExternalStore(editor.history.subscribe, editor.history.getSnapshot);
    return <InspectorBody node={snapshot.state.nodes[0]!} editor={editor} assets={assets} />;
  }
  render(<Harness />);
  const toggle = screen.getByRole("switch", { name: /Alien Power Matrices/ });
  expect(screen.getByText("· Mixed")).toBeTruthy();
  expect(screen.queryByText("Clock speed")).toBeNull();
  expect(screen.queryByText("Power Shards")).toBeNull();
  const supplied = () => {
    const current = editor.getNode(node.id);
    if (current?.kind !== "facility") throw new Error("Missing augmenter");
    return current.machines.map((m) => m.suppliedMatrices);
  };
  await user.click(toggle);
  expect(supplied()).toEqual([true, true]);
  await user.click(toggle);
  expect(supplied()).toEqual([false, false]);
  await user.click(screen.getByRole("tab", { name: "Machine 2" }));
  await user.click(toggle);
  expect(supplied()).toEqual([false, true]);
});
