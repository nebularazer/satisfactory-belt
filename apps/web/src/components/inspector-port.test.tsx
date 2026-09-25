import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import { createFactoryEditor } from "@/lib/factory-editor";
import { minerFlowFixture } from "@/test/flow-fixture";

import { InspectorPort } from "./inspector-port";

const port = { nodeId: "miner", portKey: "output:copper" };

it("separates actual flow from its authored output limit", () => {
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  editor.setLimit("miner", { kind: "output", itemId: "copper", value: 120 });
  editor.setLimit("smelter", { kind: "output", itemId: "iron", value: 30 });
  render(<InspectorPort port={port} editor={editor} assets={assets} />);
  const flow = within(screen.getByRole("region", { name: "Port flow" }));
  expect(flow.getByText("30 items/min")).toBeTruthy();
  expect(flow.getByText("Output limit: 120/min")).toBeTruthy();
  const connections = within(screen.getByRole("region", { name: "Connected machines" }));
  expect(connections.getByText("Iron Ingot")).toBeTruthy();
  expect(connections.getByText(/Smelter/)).toBeTruthy();
  expect(connections.getByText("30 items/min")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
});
