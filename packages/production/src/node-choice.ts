import {
  findBuffer,
  findBuildable,
  findDescriptor,
  findRouter,
  findTransport,
} from "./catalog";
import { productionProcessesForBuildable } from "./production-process";
import type { NodeChoice, ProductionProcess } from "./types";

function processLabel(process: ProductionProcess) {
  if (process.kind !== "extraction" && process.kind !== "resource-well") {
    return process.name;
  }
  return findDescriptor(process.outputItemIds[0])?.name ?? process.name;
}

/**
 * Lists every valid initial Node configuration for a Buildable. Choices omit
 * Node and machine-instance ids, which are assigned by the caller when placed
 * in a Plan.
 */
export function nodeChoicesForBuildable(
  buildableId: string,
): readonly NodeChoice[] {
  const buildable = findBuildable(buildableId);
  if (!buildable) return [];

  const processes = productionProcessesForBuildable(buildable.id);
  if (processes.length > 0) {
    return processes.map((process) => ({
      label: processLabel(process),
      template: {
        buildableId: buildable.id,
        kind: "process",
        processId: process.id,
      },
    }));
  }

  if (findRouter(buildable.id)) {
    return [
      {
        label: buildable.name,
        template: { buildableId: buildable.id, kind: "router" },
      },
    ];
  }

  if (findBuffer(buildable.id)) {
    return [
      {
        label: buildable.name,
        template: { buildableId: buildable.id, kind: "buffer" },
      },
    ];
  }

  const transport = findTransport(buildable.id);
  if (!transport) return [];
  return (["load", "unload"] as const).map((mode) => ({
    label: `${transport.name} (${mode === "load" ? "Load" : "Unload"})`,
    template: { buildableId: transport.id, kind: "transport", mode },
  }));
}
