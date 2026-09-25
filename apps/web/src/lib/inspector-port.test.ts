import { expect, it } from "vitest";

import { minerFlowFixture } from "../test/flow-fixture";
import { createFactoryEditor } from "./factory-editor";
import { inspectorPort, inspectorSummary, inspectorTarget, portConnections } from "./inspector";

it("selects a port ahead of its parent and preserves click-to-connect", () => {
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, { ...document, links: [] });
  const output = { nodeId: "miner", portKey: "output:copper" };
  editor.controller.selectPort(output);
  const target = inspectorTarget(editor.controller.getSnapshot());
  expect(inspectorPort(target)).toEqual(output);
  expect(inspectorSummary(editor, target)).toMatchObject({
    title: "Iron Ore · Output",
    deleteLabel: null,
  });
  editor.controller.selectPort({ nodeId: "smelter", portKey: "input:copper" });
  expect(editor.history.getSnapshot().state.links).toHaveLength(1);
  expect(inspectorPort(inspectorTarget(editor.controller.getSnapshot()))).toBeNull();
});

it("shows each branch allocation and the connected recipe and machine", () => {
  const { assets, document, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [...document.nodes, { ...smelter, id: "second" }],
    links: [
      ...document.links,
      {
        id: "second-link",
        output: document.links[0]!.output,
        input: { nodeId: "second", portKey: "input:copper" },
      },
    ],
  });
  editor.setLimit("smelter", { kind: "output", itemId: "iron", value: 30 });
  editor.setLimit("second", { kind: "output", itemId: "iron", value: 60 });
  const connections = portConnections(editor, { nodeId: "miner", portKey: "output:copper" });
  expect(connections.map((row) => row.rates)).toEqual([
    [{ itemId: "copper", perMinute: 30 }],
    [{ itemId: "copper", perMinute: 60 }],
  ]);
  expect(connections[0]!.display).toMatchObject({
    title: "Iron Ingot",
    subtitle: expect.stringContaining("Smelter"),
  });
  expect(
    portConnections(editor, { nodeId: "second", portKey: "input:copper" })[0]!.display.title,
  ).toBe("Iron Ore");
  expect(portConnections(editor, { nodeId: "second", portKey: "output:iron" })).toEqual([]);
});
