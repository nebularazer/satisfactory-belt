import { createMachineMembers } from "@satisfactory-belt/factory-core";
import type { FactoryDocument } from "@satisfactory-belt/factory-core";

import { minerFlowFixture } from "./flow-fixture";

export function storageFlowFixture(split = true) {
  const { assets, miner } = minerFlowFixture();
  assets.catalog.buildings!.storage = {
    ...assets.catalog.buildings!.augmenter!,
    id: "storage",
    name: "Storage Container",
    kind: "storage",
    powerMegawatts: 0,
    capacity: 24,
  };
  assets.catalog.logistics.splitter = {
    id: "splitter",
    name: "Splitter",
    kind: "splitter",
    descriptorId: "splitter",
    iconId: "iron",
    description: "",
  };
  const document: FactoryDocument = {
    nodes: [
      { ...miner, flow: { targets: { copper: 120 } } },
      ...(split
        ? [{ id: "splitter", kind: "logistics" as const, partId: "splitter", x: 400, y: 0 }]
        : []),
      {
        id: "storage",
        kind: "facility",
        buildingId: "storage",
        configuration: { type: "storage" },
        machines: createMachineMembers(1),
        x: 800,
        y: 0,
      },
    ],
    links: [
      {
        id: "ore",
        output: { nodeId: "miner", portKey: "output:copper" },
        input: { nodeId: split ? "splitter" : "storage", portKey: "input:0" },
      },
      ...(split
        ? [
            {
              id: "delivery",
              output: { nodeId: "splitter", portKey: "output:0" },
              input: { nodeId: "storage", portKey: "input:0" },
            },
          ]
        : []),
    ],
  };
  return { assets, document };
}
