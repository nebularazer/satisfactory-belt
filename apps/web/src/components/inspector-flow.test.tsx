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
const limit = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Production limit" });

it("shows one limit and one result, with manual clock steps that preserve the output limit", async () => {
  const user = userEvent.setup();
  const { assets, smelter } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, { nodes: [smelter], links: [] });
  render(<Harness editor={editor} assets={assets} id={smelter.id} />);
  expect(screen.queryByRole("textbox", { name: "Production limit" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Limit unit" }));
  await user.click(await screen.findByRole("menuitem", { name: "Iron Ingot/min" }));
  await user.clear(limit());
  await user.type(limit(), "75");
  await user.tab();
  expect(limit().value).toBe("75");
  expect(
    within(screen.getByRole("region", { name: "Production result" })).getByText("75 /min"),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Lock production" })).toBeNull();
  expect(screen.queryByText("Rebalance at 100%")).toBeNull();
  expect(screen.queryByText("Machine capacity")).toBeNull();
  expect(screen.queryByText("Power Shards")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Clock mode" }));
  await user.click(await screen.findByRole("menuitem", { name: "Manual" }));
  const clock = screen.getByRole<HTMLInputElement>("textbox", { name: "Clock" });
  expect(clock.value).toBe("100");
  await user.click(screen.getByRole("button", { name: "Increase Clock by 1" }));
  expect(clock.value).toBe("101");
  expect(limit().value).toBe("75");
  expect(editor.getPortRate(smelter.id, "output:iron")).toBe("75");
  await user.click(screen.getByRole("button", { name: "Use automatic clock" }));
  expect(screen.queryByRole("textbox", { name: "Clock" })).toBeNull();
  expect(limit().value).toBe("75");
  act(() => editor.historyCommand("undo"));
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Clock" }).value).toBe("101");
  await user.click(screen.getByRole("button", { name: "Clear limit" }));
  expect(screen.queryByRole("textbox", { name: "Production limit" })).toBeNull();
});

it("keeps fractional limits precise and converts coproduct units without independent targets", async () => {
  const user = userEvent.setup();
  const { assets, document } = recyclingFlowFixture();
  assets.catalog.items.Desc_HeavyOilResidue_C!.name = "Heavy Oil Residue";
  assets.catalog.items.Desc_PolymerResin_C!.name = "Polymer Resin";
  const editor = createFactoryEditor(assets.catalog, document);
  const id = "recycling-residue";
  render(<Harness editor={editor} assets={assets} id={id} />);
  await user.click(screen.getByRole("button", { name: "Limit unit" }));
  await user.click(await screen.findByRole("menuitem", { name: "Polymer Resin/min" }));
  act(() => editor.setLimit(id, { kind: "output", itemId: "Desc_PolymerResin_C", value: 500 / 3 }));
  const before = editor.history.getSnapshot().state;
  expect(limit().value).toBe("166⅔");
  await user.click(limit());
  expect(limit().value).toBe(String(500 / 3));
  await user.tab();
  expect(editor.history.getSnapshot().state).toBe(before);
  await user.click(screen.getByRole("button", { name: "Limit unit" }));
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
  expect(limit().value).toBe("333⅓");
});

it("keeps miner limits stable across purity changes and hides individual controls by default", async () => {
  const user = userEvent.setup();
  const { assets, document } = minerFlowFixture();
  const editor = createFactoryEditor(assets.catalog, document);
  render(<Harness editor={editor} assets={assets} id="miner" />);
  expect(limit().value).toBe("1");
  expect(screen.queryByText("Machines…")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Pure" }));
  expect(limit().value).toBe("1");
  expect(editor.getPortRate("miner", "output:copper")).toBe("240");
  await user.clear(limit());
  await user.type(limit(), "2");
  await user.tab();
  const details = screen.getByText("Machines…").closest("details");
  expect(details?.open).toBe(false);
  await user.click(screen.getByText("Machines…"));
  await user.click(screen.getByRole("tab", { name: "Machine 1" }));
  await user.click(screen.getByRole("button", { name: "Impure" }));
  expect(editor.getPortRate("miner", "output:copper")).toBe("300");
  expect(limit().value).toBe("2");
});
