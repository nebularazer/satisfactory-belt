/* oxlint-disable oxc/no-map-spread -- Each group retains an independent fixture configuration. */
import { createMachineMembers } from "@satisfactory-belt/factory-core";

import { createFactoryEditor } from "../lib/factory-editor";
import { minerFlowFixture } from "./flow-fixture";

export function distributionFixture(form: "solid" | "liquid" | "gas" = "solid") {
  const { assets, miner, smelter } = minerFlowFixture();
  assets.catalog.items.copper!.form = form;
  assets.catalog.items.copper!.unit = form === "solid" ? "item" : "m3";
  if (form !== "solid")
    assets.catalog.items.copper!.name = form === "liquid" ? "Water" : "Nitrogen Gas";
  assets.catalog.extractors.miner!.baseRate = 480;
  const groups = [
    [8, 240],
    [3, 80],
    [3, 80],
    [2, 48],
    [1, 26],
  ] as const;
  const consumers = groups.map(([count, rate], index) => ({
    ...smelter,
    id: `smelter-${index}`,
    machines: createMachineMembers(count),
    flow: { machineLimit: count, outputLimit: { itemId: "iron", perMinute: rate } },
  }));
  const port = { nodeId: miner.id, portKey: "output:copper" };
  const editor = createFactoryEditor(assets.catalog, {
    nodes: [
      { ...miner, flow: { outputLimit: { itemId: "copper", perMinute: 474 } } },
      ...consumers,
    ],
    links: consumers.map((node, index) => ({
      id: `ore-${index}`,
      output: port,
      input: { nodeId: node.id, portKey: "input:copper" },
    })),
  });
  return { assets, editor, port };
}
