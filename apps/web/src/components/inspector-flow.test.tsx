import { createMachineMembers } from "@satisfactory-belt/factory-core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";

import { createFactoryEditor } from "@/lib/factory-editor";
import { minerFlowFixture } from "@/test/flow-fixture";
import { recyclingFlowFixture } from "@/test/recycling-flow-fixture";

import { InspectorBody } from "./inspector-body";
import { InspectorFlow } from "./inspector-flow";

const field = (name: string) =>
  screen.getByRole<HTMLInputElement>("textbox", { name: `${name} output rate` });
const lock = () => screen.getByRole("button", { name: "Lock production" });

it("edits targets and clock, and switches finite machine capacity back to Auto", async () => {
  const user = userEvent.setup();
  const { assets, smelter } = minerFlowFixture();
  assets.catalog.items.Desc_CrystalShard_C = {
    ...assets.catalog.items.iron!,
    id: "Desc_CrystalShard_C",
  };
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [{ ...smelter, flow: { targets: { iron: 120 } } }],
    links: [],
  });
  function Harness() {
    const snapshot = useSyncExternalStore(editor.history.subscribe, editor.history.getSnapshot);
    return <InspectorBody node={snapshot.state.nodes[0]!} editor={editor} assets={assets} />;
  }
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "How clock speed works" }));
  expect((await screen.findByRole("tooltip")).textContent).toContain("3 miners at 83⅓%");
  await user.keyboard("{Escape}");
  expect(screen.queryByText("Running clock")).toBeNull();
  const details = screen.getByText(/Supply details/).closest("details");
  expect(details?.open).toBe(false);
  expect(document.querySelector('[aria-label="Production rates"] .text-destructive')).toBeNull();
  async function enter(label: string, value: string) {
    const input = screen.getByRole("textbox", { name: label });
    await user.clear(input);
    await user.type(input, value);
    await user.tab();
  }
  await enter("Iron Ingot output rate", "150");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  expect(screen.queryByRole("textbox", { name: "Machine limit" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Add machine" }));
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 6 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(250 / 3) }),
    ),
  });
  await user.click(screen.getByRole("button", { name: "Remove last machine" }));
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 5 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(100, 8) }),
    ),
  });
  await user.click(screen.getByRole("button", { name: "Lower clock: add one machine" }));
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 6 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(250 / 3) }),
    ),
  });
  await enter("Clock speed", "200");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 3 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(500 / 3) }),
    ),
  });
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Clock speed" }).value).toBe("166⅔");
  expect(screen.queryByRole("textbox", { name: "Maximum clock" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Rebalance at 100%" }));
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("150");
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Clock speed" }).value).toBe("100");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 5 }, () =>
      expect.objectContaining({ clockPercent: expect.closeTo(100, 8) }),
    ),
  });
  act(() => editor.historyCommand("undo"));
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Clock speed" }).value).toBe("166⅔");
  await user.click(screen.getByRole("button", { name: "Automatic machine sizing" }));
  await enter("Iron Ingot output rate", "300");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("300");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 5 }, () => expect.objectContaining({ clockPercent: 200 })),
  });
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Raise clock: remove one machine" })
      .disabled,
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "Raise clock: remove one machine" }));
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 4 }, () => expect.objectContaining({ clockPercent: 250 })),
  });
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Raise clock: remove one machine" })
      .disabled,
  ).toBe(true);
  expect(screen.queryByText(/Target shortfall/)).toBeNull();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Remove last machine" }).disabled,
  ).toBe(true);
  const clockInput = screen.getByRole<HTMLInputElement>("textbox", { name: "Clock speed" });
  await user.click(clockInput);
  await user.keyboard("{ArrowDown}");
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 5 }, () => expect.objectContaining({ clockPercent: 200 })),
  });
  await user.keyboard("{ArrowUp}");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("300");
  await user.tab();
  act(() => editor.setProductionTarget(smelter.id, "iron", 500 / 3));
  const unchanged = editor.history.getSnapshot().state;
  expect(field("Iron Ingot").value).toBe("166⅔");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("166⅔");
  await user.click(field("Iron Ingot"));
  expect(field("Iron Ingot").value).toBe(String(500 / 3));
  await user.tab();
  expect(field("Iron Ingot").value).toBe("166⅔");
  expect(editor.history.getSnapshot().state).toBe(unchanged);
});

it("changes unlocked count and clock directly, then preserves output when locked", async () => {
  const user = userEvent.setup();
  const { assets, smelter } = minerFlowFixture();
  assets.catalog.items.Desc_CrystalShard_C = {
    ...assets.catalog.items.iron!,
    id: "Desc_CrystalShard_C",
  };
  const editor = createFactoryEditor(assets.catalog, { nodes: [smelter], links: [] });
  function Harness() {
    const snapshot = useSyncExternalStore(editor.history.subscribe, editor.history.getSnapshot);
    return <InspectorBody node={snapshot.state.nodes[0]!} editor={editor} assets={assets} />;
  }
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Add machine" }));
  expect(field("Iron Ingot").value).toBe("60");
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Clock speed" }).value).toBe("100");
  const clock = screen.getByRole("textbox", { name: "Clock speed" });
  await user.clear(clock);
  await user.type(clock, "150");
  await user.tab();
  expect(field("Iron Ingot").value).toBe("90");
  await user.click(screen.getByRole("button", { name: "Increase Clock speed by 1" }));
  expect(field("Iron Ingot").value).toBe("90.6");
  await user.click(screen.getByRole("button", { name: "Decrease Clock speed by 1" }));
  expect(field("Iron Ingot").value).toBe("90");
  expect(lock().getAttribute("aria-pressed")).toBe("false");
  await user.click(lock());
  await user.click(screen.getByRole("button", { name: "Add machine" }));
  expect(field("Iron Ingot").value).toBe("90");
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Clock speed" }).value).toBe("100");
  await user.click(screen.getByRole("button", { name: "Raise clock: remove one machine" }));
  expect(field("Iron Ingot").value).toBe("90");
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Clock speed" }).value).toBe("150");
  await user.click(lock());
  await user.click(screen.getByRole("button", { name: "Remove last machine" }));
  expect(field("Iron Ingot").value).toBe("45");
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Clock speed" }).value).toBe("150");
  expect(lock().getAttribute("aria-pressed")).toBe("false");
});

it("shows calculated coproducts and locks or unlocks the entire recipe without independent targets", async () => {
  const user = userEvent.setup();
  const { assets, document } = recyclingFlowFixture();
  assets.catalog.items.Desc_HeavyOilResidue_C!.name = "Heavy Oil Residue";
  assets.catalog.items.Desc_PolymerResin_C!.name = "Polymer Resin";
  const editor = createFactoryEditor(assets.catalog, document);
  const id = "recycling-residue";
  function Harness() {
    const snapshot = useSyncExternalStore(editor.history.subscribe, editor.history.getSnapshot);
    const node = snapshot.state.nodes.find((entry) => entry.id === id)!;
    return node.kind === "manufacturing" ? (
      <InspectorFlow node={node} editor={editor} assets={assets} />
    ) : null;
  }
  render(<Harness />);
  const rates = (oil: string, resin: string) => {
    expect(field("Heavy Oil Residue").value).toBe(oil);
    expect(field("Polymer Resin").value).toBe(resin);
  };
  async function enter(name: string, value: string) {
    await user.clear(field(name));
    await user.type(field(name), value);
    await user.tab();
  }
  rates("600", "300");
  expect(lock().getAttribute("aria-pressed")).toBe("false");
  await user.click(field("Heavy Oil Residue"));
  await user.tab();
  expect(lock().getAttribute("aria-pressed")).toBe("false");
  await enter("Polymer Resin", "-1");
  rates("600", "300");
  expect(lock().getAttribute("aria-pressed")).toBe("false");
  await user.click(lock());
  expect(lock().getAttribute("aria-pressed")).toBe("true");
  act(() => editor.setOperatingSetting(id, "all", "clockPercent", 100));
  rates("600", "300");
  expect(editor.getNode(id)).toMatchObject({
    machines: Array.from({ length: 15 }, () => expect.objectContaining({ clockPercent: 100 })),
  });
  await enter("Polymer Resin", "150");
  rates("300", "150");
  expect(editor.getNode(id)).toMatchObject({ flow: { targets: { Desc_PolymerResin_C: 150 } } });
  await enter("Heavy Oil Residue", "800");
  rates("800", "400");
  const node = editor.getNode(id);
  expect(node?.kind === "manufacturing" && node.flow?.targets).toEqual({
    Desc_HeavyOilResidue_C: 800,
  });
  await user.click(lock());
  expect(lock().getAttribute("aria-pressed")).toBe("false");
  rates("600", "300");
  act(() => editor.historyCommand("undo"));
  rates("800", "400");
  expect(lock().getAttribute("aria-pressed")).toBe("true");
  act(() => editor.historyCommand("redo"));
  rates("600", "300");
  expect(lock().getAttribute("aria-pressed")).toBe("false");
  // Editing an automatic output also locks every coproduct at the new recipe rate.
  await enter("Polymer Resin", "400");
  rates("800", "400");
  expect(lock().getAttribute("aria-pressed")).toBe("true");
});

it("propagates miner tier and purity clicks through the inspector, including member scope", async () => {
  const user = userEvent.setup();
  const { assets, document, smelter } = minerFlowFixture();
  assets.catalog.items.Desc_CrystalShard_C = {
    ...assets.catalog.items.iron!,
    id: "Desc_CrystalShard_C",
  };
  assets.catalog.extractors.mk1 = {
    ...assets.catalog.extractors.miner!,
    id: "mk1",
    name: "Miner Mk.1",
    baseRate: 60,
  };
  assets.catalog.extractors.mk3 = {
    ...assets.catalog.extractors.miner!,
    id: "mk3",
    name: "Miner Mk.3",
    baseRate: 240,
  };
  const editor = createFactoryEditor(assets.catalog, {
    ...document,
    nodes: [document.nodes[0]!, { ...smelter, machines: createMachineMembers(4) }],
  });
  function Harness() {
    const snapshot = useSyncExternalStore(editor.history.subscribe, editor.history.getSnapshot);
    return <InspectorBody node={snapshot.state.nodes[0]!} editor={editor} assets={assets} />;
  }
  render(<Harness />);
  for (const [button, count, rate] of [
    ["Pure", 8, "240"],
    ["Mk.3", 16, "480"],
    ["Impure", 4, "120"],
    ["Normal", 8, "240"],
    ["Mk.1", 2, "60"],
    ["Add machine", 4, "120"],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- Each click edits the state used by the next click.
    await user.click(screen.getByRole("button", { name: button }));
    expect(editor.getLinkRates("ore")).toEqual([rate]);
    expect(editor.getNode(smelter.id)).toMatchObject({
      machines: Array.from({ length: count }, () => expect.objectContaining({ clockPercent: 100 })),
    });
    expect(lock().getAttribute("aria-pressed")).toBe("false");
  }
  await user.click(screen.getByRole("tab", { name: "Machine 1" }));
  await user.click(screen.getByRole("button", { name: "Pure" }));
  expect(editor.getLinkRates("ore")).toEqual(["180"]);
  expect(editor.getNode(smelter.id)).toMatchObject({
    machines: Array.from({ length: 6 }, () => expect.objectContaining({ clockPercent: 100 })),
  });
});
