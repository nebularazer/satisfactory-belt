import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";

import { createFactoryEditor } from "@/lib/factory-editor";
import type { GameAssets } from "@/lib/game-assets";
import { minerFlowFixture } from "@/test/flow-fixture";
import { recyclingFlowFixture } from "@/test/recycling-flow-fixture";

import { InspectorBody } from "./inspector-body";

function Harness({
  editor,
  assets,
  id,
}: {
  editor: ReturnType<typeof createFactoryEditor>;
  assets: GameAssets;
  id: string;
}) {
  const snapshot = useSyncExternalStore(editor.history.subscribe, editor.history.getSnapshot);
  return (
    <InspectorBody
      node={snapshot.state.nodes.find((node) => node.id === id)!}
      editor={editor}
      assets={assets}
    />
  );
}
const limit = () => screen.getByRole<HTMLInputElement>("spinbutton", { name: "Production limit" });

it("keeps inputs, outputs and statistics visible with stable manual clock controls", async () => {
  const user = userEvent.setup();
  const { assets, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, { nodes: [smelter], links: [] });
  render(<Harness editor={editor} assets={assets} id={smelter.id} />);
  expect(limit().disabled).toBe(true);
  expect(limit().placeholder).toBe("No Limit");
  await user.click(screen.getByRole("button", { name: "Limit output per minute" }));
  await user.clear(limit());
  await user.type(limit(), "75");
  await user.tab();
  expect(limit().value).toBe("75");
  expect(
    within(screen.getByRole("region", { name: "Configured material rates" })).getAllByText(
      "75 items/min",
    )[0],
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Lock production" })).toBeNull();
  expect(screen.queryByText("Rebalance at 100%")).toBeNull();
  expect(screen.queryByText("Machine capacity")).toBeNull();
  expect(screen.getByText("Power Shards")).toBeTruthy();
  expect(screen.getByText("Total power")).toBeTruthy();
  expect(screen.getByText("Inputs")).toBeTruthy();
  expect(screen.getByText("Outputs")).toBeTruthy();
  expect(document.querySelector("details")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Use manual clock" }));
  const clock = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Clock" });
  expect(clock.value).toBe("100");
  await user.clear(clock);
  await user.type(clock, "101");
  await user.tab();
  expect(screen.getByRole<HTMLInputElement>("spinbutton", { name: "Clock" }).value).toBe("101");
  expect(limit().value).toBe("75");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("75");
  await user.click(screen.getByRole("button", { name: "Use automatic clock" }));
  expect(screen.getByRole<HTMLInputElement>("spinbutton", { name: "Clock" }).disabled).toBe(true);
  expect(limit().value).toBe("75");
  act(() => editor.historyCommand("undo"));
  expect(screen.getByRole<HTMLInputElement>("spinbutton", { name: "Clock" }).value).toBe("101");
  await user.click(screen.getByRole("button", { name: "No limit" }));
  expect(limit().disabled).toBe(true);
});

it("keeps fractional limits precise and converts coproduct units without independent targets", async () => {
  const user = userEvent.setup();
  const { assets, document } = recyclingFlowFixture();
  assets.catalog.items.Desc_HeavyOilResidue_C!.name = "Heavy Oil Residue";
  assets.catalog.items.Desc_PolymerResin_C!.name = "Polymer Resin";
  const editor = createFactoryEditor(assets.catalog, document);
  const id = "recycling-residue";
  render(<Harness editor={editor} assets={assets} id={id} />);
  await user.click(screen.getByRole("button", { name: "Limit output per minute" }));
  await user.click(screen.getByRole("button", { name: "Output limit item" }));
  await user.click(await screen.findByRole("menuitem", { name: "Polymer Resin/min" }));
  act(() => editor.setLimit(id, { kind: "output", itemId: "Desc_PolymerResin_C", value: 500 / 3 }));
  const before = editor.history.getSnapshot().state;
  expect(limit().value).toBe(String(500 / 3));
  await user.click(limit());
  expect(limit().value).toBe(String(500 / 3));
  await user.tab();
  expect(editor.history.getSnapshot().state).toBe(before);
  await user.click(screen.getByRole("button", { name: "Output limit item" }));
  await user.click(await screen.findByRole("menuitem", { name: "Heavy Oil Residue/min" }));
  expect(editor.getNode(id)).toMatchObject({
    flow: {
      machineLimit: null,
      outputLimit: { itemId: "Desc_HeavyOilResidue_C", perMinute: expect.closeTo(1000 / 3) },
    },
  });
  await user.clear(limit());
  await user.type(limit(), "-1");
  await user.tab();
  expect(limit().value).toBe(String(1000 / 3));
});

it("keeps miner limits stable across purity changes with visible machine tabs", async () => {
  const user = userEvent.setup();
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  assets.catalog.extractors.miner3 = {
    ...assets.catalog.extractors.miner!,
    id: "miner3",
    name: "Miner Mk.3",
    baseRate: 240,
  };
  render(<Harness editor={editor} assets={assets} id="miner" />);
  expect(limit().value).toBe("1");
  expect(screen.getByRole("tab", { name: "Machine 1" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Add machine" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove last machine" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Pure" }));
  expect(limit().value).toBe("1");
  expect(editor.getPortRate("miner", "output:copper")).toBe("240");
  await user.clear(limit());
  await user.type(limit(), "2");
  await user.tab();
  expect(screen.getByRole("tab", { name: "Machine 2" })).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Machine 1" }));
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Impure" }).disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Mk.2" }).disabled).toBe(true);
  const before = editor.history.getSnapshot().state;
  expect(() => editor.setOperatingSetting("miner", "1", "purity", 0.5)).toThrow("entire group");
  await user.click(screen.getByRole("button", { name: "Impure" }));
  expect(editor.history.getSnapshot().state).toBe(before);
  await user.click(screen.getByRole("tab", { name: "All" }));
  await user.click(screen.getByRole("button", { name: "Impure" }));
  expect(editor.getPortRate("miner", "output:copper")).toBe("120");
  expect(limit().value).toBe("2");
});

it("edits one machine's clock and shows Mixed for All without flattening other machines", async () => {
  const user = userEvent.setup();
  const { assets, document: plan } = minerFlowFixture();
  assets.catalog.machines.smelter!.sloopSlots = 1;
  const editor = createFactoryEditor(assets.catalog, plan);
  editor.setLimit("smelter", { kind: "machines", value: 4 });
  render(<Harness editor={editor} assets={assets} id="smelter" />);
  expect(screen.getByText("Somersloops")).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Machine 4" }));
  const clock = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Clock" });
  expect(clock.value).toBe("100");
  await user.clear(clock);
  await user.type(clock, "50");
  await user.tab();
  expect(editor.getNode("smelter")).toMatchObject({
    machines: [
      expect.objectContaining({ clockPercent: 100 }),
      expect.objectContaining({ clockPercent: 100 }),
      expect.objectContaining({ clockPercent: 100 }),
      expect.objectContaining({ clockPercent: 50 }),
    ],
  });
  expect(editor.getPortRate("smelter", "output:iron")).toBe("105");
  await user.click(screen.getByRole("tab", { name: "All" }));
  expect(screen.getByRole<HTMLInputElement>("spinbutton", { name: "Clock" }).placeholder).toBe(
    "Mixed",
  );
  expect(screen.getByText("Total power")).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Machine 1" }));
  expect(screen.getByRole<HTMLInputElement>("spinbutton", { name: "Clock" }).value).toBe("100");
  act(() => editor.historyCommand("undo"));
  expect(editor.getPortRate("smelter", "output:iron")).toBe("120");
  act(() => editor.historyCommand("redo"));
  expect(editor.getPortRate("smelter", "output:iron")).toBe("105");
  expect(document.querySelector("details")).toBeNull();
});

it("steps numeric controls and counts required Somersloops without supply details", async () => {
  const user = userEvent.setup();
  const { assets, document: plan } = minerFlowFixture();
  assets.catalog.machines.smelter!.sloopSlots = 1;
  const editor = createFactoryEditor(assets.catalog, plan);
  editor.setLimit("smelter", { kind: "machines", value: 4 });
  editor.setOperatingSetting("smelter", "all", "sloopsUsed", 1);
  render(<Harness editor={editor} assets={assets} id="smelter" />);
  expect(screen.getByText("Somersloops").parentElement!.textContent).toBe("Somersloops4");
  expect(screen.queryByText(/Supply details/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Increase Production limit by 1" }));
  expect(limit().value).toBe("5");
  expect(screen.getByText("Somersloops").parentElement!.textContent).toBe("Somersloops5");
  await user.click(screen.getByRole("button", { name: "Decrease Production limit by 1" }));
  expect(limit().value).toBe("4");
  await user.click(screen.getByRole("button", { name: "No limit" }));
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Increase Production limit by 1" })
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Use manual clock" }));
  await user.click(screen.getByRole("button", { name: "Increase Clock by 1" }));
  expect(screen.getByRole<HTMLInputElement>("spinbutton", { name: "Clock" }).value).toBe("101");
  await user.click(screen.getByRole("button", { name: "Use automatic clock" }));
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Decrease Clock by 1" }).disabled,
  ).toBe(true);
});

it("resets the selected clock to 100% and preserves the production limit", async () => {
  const user = userEvent.setup();
  const { assets, document: plan } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, plan);
  editor.setLimit("smelter", { kind: "machines", value: 2 });
  editor.setClock("smelter", 50);
  render(<Harness editor={editor} assets={assets} id="smelter" />);
  await user.click(screen.getByRole("tab", { name: "Machine 2" }));
  await user.click(screen.getByRole("button", { name: "Reset clock to 100%" }));
  expect(editor.getNode("smelter")).toMatchObject({
    flow: { machineLimit: 2, clockMode: "manual" },
    machines: [
      expect.objectContaining({ clockPercent: 50 }),
      expect.objectContaining({ clockPercent: 100 }),
    ],
  });
  await user.click(screen.getByRole("tab", { name: "All" }));
  await user.click(screen.getByRole("button", { name: "Use automatic clock" }));
  await user.click(screen.getByRole("button", { name: "Reset clock to 100%" }));
  expect(editor.getNode("smelter")).toMatchObject({
    flow: { machineLimit: 2, clockMode: "manual" },
    machines: [
      expect.objectContaining({ clockPercent: 100 }),
      expect.objectContaining({ clockPercent: 100 }),
    ],
  });
});
