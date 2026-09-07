import {
  analyzeBasicPlan,
  assertDetailedNodeConfiguration,
  createBasicPlan,
  createDetailedPlan,
  DEFAULT_LOGISTICS_TIERS,
  type MaterialEndpoint,
  type PhysicalConnection,
} from "@satisfactory-belt/planning";
import { createNode } from "@satisfactory-belt/production";

import {
  CANVAS_DOCUMENT_VERSION,
  type CanvasDocument,
  type CanvasMaterialLink,
  type CanvasNode,
} from "./document";
import { nodeCardLayout } from "./node-card-layout";

export type CanvasEditorMode = "basic" | "detailed";

const POSITION_SCALE = 4;
const NODE_GAP = 32;

function endpointKey(endpoint: MaterialEndpoint) {
  return `${endpoint.nodeId}\u0000${endpoint.portId}`;
}

function occurrenceKey(linkId: string, side: "from" | "to") {
  return `${linkId}\u0000${side}`;
}

function chunks<T>(values: readonly T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function scaledPosition(
  node: CanvasNode,
  origin: Readonly<{ x: number; y: number }>,
) {
  return {
    x: (node.x - origin.x) * POSITION_SCALE,
    y: (node.y - origin.y) * POSITION_SCALE,
  };
}

function canvasNode(
  source: CanvasNode,
  configuration: CanvasNode["configuration"],
  position: Readonly<{ x: number; y: number }>,
  label = source.label,
): CanvasNode {
  const layout = nodeCardLayout(configuration);
  return {
    ...source,
    configuration,
    height: layout.height,
    label,
    width: layout.width,
    x: position.x,
    y: position.y,
  };
}

function physicalConnection(link: CanvasMaterialLink): PhysicalConnection {
  const logistics = link.logistics;
  if (!logistics) throw new Error(`Detailed link ${link.id} has no tier.`);
  return {
    from: link.from,
    id: link.id,
    kind: logistics.kind,
    tierId: logistics.tierId,
    to: link.to,
  };
}

/**
 * Expands a compact Basic canvas into a validated physical canvas projection.
 * Callers only need to choose a mode; all machine allocation and logistics
 * topology stays local to this module.
 */
export function materializeDetailedCanvas(
  document: CanvasDocument,
): CanvasDocument {
  const plan = createBasicPlan({
    materialLinks: document.materialLinks,
    nodes: document.nodes.map(({ configuration, provenance }) => ({
      configuration,
      ...(provenance ? { provenance } : {}),
    })),
  });
  const analysis = analyzeBasicPlan(plan);
  const origin = {
    x: Math.min(0, ...document.nodes.map(({ x }) => x)),
    y: Math.min(0, ...document.nodes.map(({ y }) => y)),
  };
  const sourceById = new Map(
    document.nodes.map((node) => [node.configuration.id, node]),
  );
  const physicalNodes: CanvasNode[] = [];
  const physicalByBasicId = new Map<string, CanvasNode[]>();
  const generatedSequence = new Map<string, number>();
  const materialLinks: CanvasMaterialLink[] = [];
  const mappedOccurrences = new Map<string, MaterialEndpoint>();
  let connectionSequence = 0;

  for (const basicNode of document.nodes) {
    const base = scaledPosition(basicNode, origin);
    const configuration = basicNode.configuration;
    if (configuration.kind !== "process") {
      const projected = canvasNode(basicNode, configuration, base);
      physicalNodes.push(projected);
      physicalByBasicId.set(configuration.id, [projected]);
      continue;
    }

    const columns = Math.min(
      4,
      Math.max(1, Math.ceil(Math.sqrt(configuration.instances.length))),
    );
    const nodes = configuration.instances.map((instance, index) => {
      const id = `${configuration.id}:machine:${index + 1}`;
      const singular = {
        ...configuration,
        id,
        instances: [instance],
      } as CanvasNode["configuration"];
      const layout = nodeCardLayout(singular);
      return canvasNode(
        basicNode,
        singular,
        {
          x: base.x + (index % columns) * (layout.width + NODE_GAP),
          y: base.y + Math.floor(index / columns) * (layout.height + NODE_GAP),
        },
        `${basicNode.label} ${index + 1}`,
      );
    });
    physicalNodes.push(...nodes);
    physicalByBasicId.set(configuration.id, nodes);
  }

  const tierFor = (kind: "conveyor" | "pipeline") =>
    DEFAULT_LOGISTICS_TIERS.filter(({ medium }) => medium === kind).toSorted(
      (left, right) => right.capacityPerMinute - left.capacityPerMinute,
    )[0]!;

  const connect = (
    from: MaterialEndpoint,
    to: MaterialEndpoint,
    kind: "conveyor" | "pipeline",
    idHint: string,
  ) => {
    connectionSequence += 1;
    materialLinks.push({
      from,
      id: `detailed:${idHint}:connection:${connectionSequence}`,
      logistics: { kind, tierId: tierFor(kind).id },
      to,
    });
  };

  const addRouter = (
    owner: CanvasNode,
    itemId: string,
    role: "input" | "output",
    buildableId: string,
  ) => {
    const sequenceKey = `${owner.configuration.id}\u0000${role}`;
    const sequence = (generatedSequence.get(sequenceKey) ?? 0) + 1;
    generatedSequence.set(sequenceKey, sequence);
    const id = `detailed:${owner.configuration.id}:${role}:router:${sequence}`;
    const configuration = createNode({
      buildableId,
      id,
      itemId,
      kind: "router",
    }).configuration;
    const layout = nodeCardLayout(configuration);
    const base = scaledPosition(owner, origin);
    const column = (sequence - 1) % 3;
    const row = Math.floor((sequence - 1) / 3);
    const x =
      role === "output"
        ? base.x + owner.width + 80 + column * (layout.width + NODE_GAP)
        : base.x - 80 - layout.width - column * (layout.width + NODE_GAP);
    const projected = canvasNode(
      owner,
      configuration,
      { x, y: base.y + row * (layout.height + NODE_GAP) },
      buildableId.includes("Merger") ? "Merger" : "Splitter",
    );
    physicalNodes.push(projected);
    return projected;
  };

  const mergeSources = (
    endpoints: readonly MaterialEndpoint[],
    owner: CanvasNode,
    itemId: string,
    kind: "conveyor" | "pipeline",
  ) => {
    let current = [...endpoints];
    while (current.length > 1) {
      const next: MaterialEndpoint[] = [];
      for (const group of chunks(current, kind === "conveyor" ? 3 : 3)) {
        if (group.length === 1) {
          next.push(group[0]!);
          continue;
        }
        const router = addRouter(
          owner,
          itemId,
          "output",
          kind === "conveyor"
            ? "Build_ConveyorAttachmentMerger_C"
            : "Build_PipelineJunction_Cross_C",
        );
        group.forEach((endpoint, index) =>
          connect(
            endpoint,
            {
              nodeId: router.configuration.id,
              portId:
                kind === "conveyor"
                  ? `input:${index + 1}`
                  : `port:${index + 1}`,
            },
            kind,
            "merge",
          ),
        );
        next.push({
          nodeId: router.configuration.id,
          portId: kind === "conveyor" ? "output:1" : "port:4",
        });
      }
      current = next;
    }
    return current[0]!;
  };

  const splitConsumers = (
    endpoints: readonly MaterialEndpoint[],
    owner: CanvasNode,
    itemId: string,
    kind: "conveyor" | "pipeline",
  ) => {
    let current = [...endpoints];
    while (current.length > 1) {
      const next: MaterialEndpoint[] = [];
      for (const group of chunks(current, 3)) {
        if (group.length === 1) {
          next.push(group[0]!);
          continue;
        }
        const router = addRouter(
          owner,
          itemId,
          "input",
          kind === "conveyor"
            ? "Build_ConveyorAttachmentSplitter_C"
            : "Build_PipelineJunction_Cross_C",
        );
        group.forEach((endpoint, index) =>
          connect(
            {
              nodeId: router.configuration.id,
              portId:
                kind === "conveyor"
                  ? `output:${index + 1}`
                  : `port:${index + 1}`,
            },
            endpoint,
            kind,
            "split",
          ),
        );
        next.push({
          nodeId: router.configuration.id,
          portId: kind === "conveyor" ? "input:1" : "port:4",
        });
      }
      current = next;
    }
    return current[0]!;
  };

  const fanOut = (
    count: number,
    owner: CanvasNode,
    itemId: string,
    kind: "conveyor" | "pipeline",
  ): Readonly<{
    leaves: readonly MaterialEndpoint[];
    root: MaterialEndpoint;
  }> => {
    const router = addRouter(
      owner,
      itemId,
      "output",
      kind === "conveyor"
        ? "Build_ConveyorAttachmentSplitter_C"
        : "Build_PipelineJunction_Cross_C",
    );
    const groupCount = Math.min(3, count);
    const counts = Array.from(
      { length: groupCount },
      (_, index) =>
        Math.floor(count / groupCount) + (index < count % groupCount ? 1 : 0),
    );
    const leaves: MaterialEndpoint[] = [];
    counts.forEach((childCount, index) => {
      const output = {
        nodeId: router.configuration.id,
        portId:
          kind === "conveyor" ? `output:${index + 1}` : `port:${index + 1}`,
      };
      if (childCount === 1) {
        leaves.push(output);
        return;
      }
      const child = fanOut(childCount, owner, itemId, kind);
      connect(output, child.root, kind, "fan-out");
      leaves.push(...child.leaves);
    });
    return {
      leaves,
      root: {
        nodeId: router.configuration.id,
        portId: kind === "conveyor" ? "input:1" : "port:4",
      },
    };
  };

  const fanIn = (
    count: number,
    owner: CanvasNode,
    itemId: string,
    kind: "conveyor" | "pipeline",
  ): Readonly<{
    leaves: readonly MaterialEndpoint[];
    root: MaterialEndpoint;
  }> => {
    const router = addRouter(
      owner,
      itemId,
      "input",
      kind === "conveyor"
        ? "Build_ConveyorAttachmentMerger_C"
        : "Build_PipelineJunction_Cross_C",
    );
    const groupCount = Math.min(3, count);
    const counts = Array.from(
      { length: groupCount },
      (_, index) =>
        Math.floor(count / groupCount) + (index < count % groupCount ? 1 : 0),
    );
    const leaves: MaterialEndpoint[] = [];
    counts.forEach((childCount, index) => {
      const input = {
        nodeId: router.configuration.id,
        portId:
          kind === "conveyor" ? `input:${index + 1}` : `port:${index + 1}`,
      };
      if (childCount === 1) {
        leaves.push(input);
        return;
      }
      const child = fanIn(childCount, owner, itemId, kind);
      connect(child.root, input, kind, "fan-in");
      leaves.push(...child.leaves);
    });
    return {
      leaves,
      root: {
        nodeId: router.configuration.id,
        portId: kind === "conveyor" ? "output:1" : "port:4",
      },
    };
  };

  const itemByEndpoint = new Map<string, string>();
  for (const network of analysis.networks) {
    if (!network.itemId) continue;
    for (const key of network.portKeys) itemByEndpoint.set(key, network.itemId);
  }

  for (const basicNode of document.nodes) {
    const resolved = createNode(basicNode.configuration);
    const projections = physicalByBasicId.get(basicNode.configuration.id) ?? [];
    for (const port of resolved.ports) {
      const basicEndpoint = {
        nodeId: basicNode.configuration.id,
        portId: port.id,
      };
      const occurrences = plan.materialLinks
        .flatMap((link) => [
          ...(endpointKey(link.from) === endpointKey(basicEndpoint)
            ? [{ linkId: link.id, side: "from" as const }]
            : []),
          ...(endpointKey(link.to) === endpointKey(basicEndpoint)
            ? [{ linkId: link.id, side: "to" as const }]
            : []),
        ])
        .toSorted((left, right) => left.linkId.localeCompare(right.linkId));
      if (!occurrences.length) continue;

      if (basicNode.configuration.kind !== "process") {
        const endpoint = {
          nodeId: basicNode.configuration.id,
          portId: port.id,
        };
        for (const occurrence of occurrences) {
          mappedOccurrences.set(
            occurrenceKey(occurrence.linkId, occurrence.side),
            endpoint,
          );
        }
        continue;
      }

      const itemId =
        itemByEndpoint.get(endpointKey(basicEndpoint)) ?? port.itemId;
      if (!itemId) {
        throw new Error(
          `Cannot materialize unresolved Process port ${endpointKey(basicEndpoint)}.`,
        );
      }
      const kind = port.medium === "pipeline" ? "pipeline" : "conveyor";
      const machineEndpoints = projections.map(({ configuration }) => ({
        nodeId: configuration.id,
        portId: port.id,
      }));

      if (port.direction === "output") {
        const machineRoot = mergeSources(
          machineEndpoints,
          basicNode,
          itemId,
          kind,
        );
        const leaves =
          occurrences.length === 1
            ? [machineRoot]
            : (() => {
                const branch = fanOut(
                  occurrences.length,
                  basicNode,
                  itemId,
                  kind,
                );
                connect(machineRoot, branch.root, kind, "aggregate-output");
                return branch.leaves;
              })();
        occurrences.forEach((occurrence, index) =>
          mappedOccurrences.set(
            occurrenceKey(occurrence.linkId, occurrence.side),
            leaves[index]!,
          ),
        );
      } else {
        const machineRoot = splitConsumers(
          machineEndpoints,
          basicNode,
          itemId,
          kind,
        );
        const leaves =
          occurrences.length === 1
            ? [machineRoot]
            : (() => {
                const branch = fanIn(
                  occurrences.length,
                  basicNode,
                  itemId,
                  kind,
                );
                connect(branch.root, machineRoot, kind, "aggregate-input");
                return branch.leaves;
              })();
        occurrences.forEach((occurrence, index) =>
          mappedOccurrences.set(
            occurrenceKey(occurrence.linkId, occurrence.side),
            leaves[index]!,
          ),
        );
      }
    }
  }

  for (const link of plan.materialLinks) {
    const from = mappedOccurrences.get(occurrenceKey(link.id, "from"));
    const to = mappedOccurrences.get(occurrenceKey(link.id, "to"));
    if (!from || !to) {
      throw new Error(`Cannot materialize Basic link ${link.id}.`);
    }
    const owner = sourceById.get(link.from.nodeId);
    const port = owner
      ? createNode(owner.configuration).ports.find(
          ({ id }) => id === link.from.portId,
        )
      : undefined;
    connect(
      from,
      to,
      port?.medium === "pipeline" ? "pipeline" : "conveyor",
      `basic-link:${link.id}`,
    );
  }

  const detailedNodes = physicalNodes.map(({ configuration, provenance }) => {
    assertDetailedNodeConfiguration(configuration);
    return {
      configuration,
      ...(provenance ? { provenance } : {}),
    };
  });
  createDetailedPlan({
    connections: materialLinks.map(physicalConnection),
    nodes: detailedNodes,
    tiers: DEFAULT_LOGISTICS_TIERS,
  });

  return {
    kind: "basic",
    materialLinks,
    nodes: physicalNodes,
    version: CANVAS_DOCUMENT_VERSION,
  };
}
