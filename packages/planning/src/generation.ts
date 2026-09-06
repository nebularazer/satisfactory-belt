import {
  createNode,
  findDescriptor,
  type NodeConfiguration,
} from "@satisfactory-belt/production";

import { createBasicPlan } from "./basic-topology";
import { createDetailedPlan, DEFAULT_LOGISTICS_TIERS } from "./detailed-plan";
import { solveSteadyState } from "./steady-state-solver";
import type {
  BasicGenerationOptions,
  BasicNode,
  DetailedGenerationOptions,
  DetailedNode,
  GeneratedBasicPlan,
  GeneratedDetailedPlan,
  LogisticsTier,
  MaterialEndpoint,
  MaterialLink,
  PhysicalConnection,
  PlanningRequest,
  ProcessActivity,
} from "./types";

type TopologyNode = Readonly<{
  configuration: NodeConfiguration;
  provenance?: BasicNode["provenance"];
}>;

type TopologyResult = Readonly<{
  connections: readonly Readonly<{
    from: MaterialEndpoint;
    id: string;
    itemId: string;
    to: MaterialEndpoint;
  }>[];
  nodes: readonly TopologyNode[];
}>;

function activityChunks(activity: number) {
  const chunks: number[] = [];
  let remaining = activity;
  while (remaining > 1e-8) {
    const chunk = Math.min(2.5, remaining);
    chunks.push(chunk);
    remaining -= chunk;
  }
  return chunks.length ? chunks : [1];
}

function processConfiguration(
  activity: ProcessActivity,
  id: string,
  chunks: readonly number[],
): NodeConfiguration {
  const template = createNode({
    buildableId: activity.buildableId,
    id,
    kind: "process",
    processId: activity.processId,
  });
  if (template.kind !== "process") throw new Error("Expected a Process Node.");
  const base = template.configuration.instances[0]!;
  const instances = chunks.map((chunk, index) => ({
    ...base,
    ...("clockSpeedPercent" in base
      ? { clockSpeedPercent: Math.max(1, Math.min(250, chunk * 100)) }
      : {}),
    id: `${id}:instance-${index + 1}`,
  }));
  return createNode({ ...template.configuration, id, instances }).configuration;
}

function processNodes(
  request: PlanningRequest,
  activities: readonly ProcessActivity[],
  detailed: boolean,
) {
  const nodes: TopologyNode[] = [];
  for (const [activityIndex, activity] of activities.entries()) {
    const chunks = activityChunks(activity.activity);
    const groups = detailed ? chunks.map((chunk) => [chunk]) : [chunks];
    for (const [groupIndex, group] of groups.entries()) {
      const id = `${detailed ? "detailed" : "basic"}:process:${activityIndex + 1}:${groupIndex + 1}`;
      nodes.push({
        configuration: processConfiguration(activity, id, group),
        provenance: {
          processId: activity.processId,
          requestOutputItemIds: request.outputs
            .map(({ itemId }) => itemId)
            .toSorted(),
        },
      });
    }
  }
  return nodes;
}

function topologyFor(nodes: readonly TopologyNode[]): TopologyResult {
  const allNodes = [...nodes];
  const connections: Array<{
    from: MaterialEndpoint;
    id: string;
    itemId: string;
    to: MaterialEndpoint;
  }> = [];
  let nodeSequence = 0;
  let connectionSequence = 0;
  const addRouter = (buildableId: string, itemId: string) => {
    nodeSequence += 1;
    const id = `generated:router:${nodeSequence}`;
    const configuration = createNode({
      buildableId,
      id,
      itemId,
      kind: "router",
    }).configuration;
    allNodes.push({ configuration });
    return configuration;
  };
  const connect = (
    from: MaterialEndpoint,
    to: MaterialEndpoint,
    itemId: string,
  ) => {
    connectionSequence += 1;
    connections.push({
      from,
      id: `generated:connection:${connectionSequence}`,
      itemId,
      to,
    });
  };
  const resolved = () =>
    allNodes.map((node) => ({
      basic: node,
      resolved: createNode(node.configuration),
    }));
  const itemIds = [
    ...new Set(
      resolved().flatMap(({ resolved: node }) =>
        node.ports.flatMap(({ itemId }) => itemId ?? []),
      ),
    ),
  ].toSorted();

  for (const itemId of itemIds) {
    const endpoints = resolved().flatMap(({ resolved: node }) =>
      node.ports
        .filter((port) => port.itemId === itemId && port.purpose !== "fuel")
        .map((port) => ({
          direction: port.direction,
          endpoint: { nodeId: node.configuration.id, portId: port.id },
          medium: port.medium,
        })),
    );
    let sources = endpoints
      .filter(({ direction }) => direction === "output")
      .map(({ endpoint }) => endpoint);
    let consumers = endpoints
      .filter(({ direction }) => direction === "input")
      .map(({ endpoint }) => endpoint);
    const medium =
      findDescriptor(itemId)?.form === "solid" ? "conveyor" : "pipeline";
    if (!sources.length || !consumers.length) continue;

    if (medium === "conveyor") {
      while (sources.length > 1) {
        const next: MaterialEndpoint[] = [];
        for (let index = 0; index < sources.length; index += 3) {
          const group = sources.slice(index, index + 3);
          if (group.length === 1) {
            next.push(group[0]!);
            continue;
          }
          const router = addRouter("Build_ConveyorAttachmentMerger_C", itemId);
          group.forEach((source, portIndex) =>
            connect(
              source,
              { nodeId: router.id, portId: `input:${portIndex + 1}` },
              itemId,
            ),
          );
          next.push({ nodeId: router.id, portId: "output:1" });
        }
        sources = next;
      }
      while (consumers.length > 1) {
        const next: MaterialEndpoint[] = [];
        for (let index = 0; index < consumers.length; index += 3) {
          const group = consumers.slice(index, index + 3);
          if (group.length === 1) {
            next.push(group[0]!);
            continue;
          }
          const router = addRouter(
            "Build_ConveyorAttachmentSplitter_C",
            itemId,
          );
          group.forEach((consumer, portIndex) =>
            connect(
              { nodeId: router.id, portId: `output:${portIndex + 1}` },
              consumer,
              itemId,
            ),
          );
          next.push({ nodeId: router.id, portId: "input:1" });
        }
        consumers = next;
      }
      connect(sources[0]!, consumers[0]!, itemId);
    } else {
      let ports = [...sources, ...consumers];
      if (ports.length === 2) {
        connect(ports[0]!, ports[1]!, itemId);
        continue;
      }
      while (ports.length > 4) {
        const group = ports.splice(0, 3);
        const router = addRouter("Build_PipelineJunction_Cross_C", itemId);
        group.forEach((endpoint, index) =>
          connect(
            endpoint,
            { nodeId: router.id, portId: `port:${index + 1}` },
            itemId,
          ),
        );
        ports.unshift({ nodeId: router.id, portId: "port:4" });
      }
      const router = addRouter("Build_PipelineJunction_Cross_C", itemId);
      ports.forEach((endpoint, index) =>
        connect(
          endpoint,
          { nodeId: router.id, portId: `port:${index + 1}` },
          itemId,
        ),
      );
    }
  }
  return { connections, nodes: allNodes };
}

export function generateBasicPlan(
  request: PlanningRequest,
  options: BasicGenerationOptions = {},
): GeneratedBasicPlan {
  const solution = solveSteadyState(request);
  const topology = topologyFor(
    processNodes(request, solution.activities, false),
  );
  const spacing = options.spacing ?? { x: 320, y: 240 };
  const nodes: BasicNode[] = topology.nodes.map((node, index) => ({
    ...node,
    position: {
      x: (index % 4) * spacing.x,
      y: Math.floor(index / 4) * spacing.y,
    },
  }));
  const materialLinks: MaterialLink[] = topology.connections.map(
    ({ from, id, to }) => ({ from, id, to }),
  );
  return { plan: createBasicPlan({ materialLinks, nodes }), solution };
}

function allowedTiers(options: DetailedGenerationOptions) {
  const allowed = options.allowedTierIds
    ? new Set(options.allowedTierIds)
    : undefined;
  return DEFAULT_LOGISTICS_TIERS.filter(
    (tier) => !allowed || allowed.has(tier.id),
  );
}

function largestTier(
  tiers: readonly LogisticsTier[],
  medium: LogisticsTier["medium"],
) {
  const tier = tiers
    .filter((candidate) => candidate.medium === medium)
    .toSorted(
      (a, b) =>
        b.capacityPerMinute - a.capacityPerMinute || a.id.localeCompare(b.id),
    )[0];
  if (!tier) throw new Error(`No ${medium} tier is allowed.`);
  return tier;
}

export function generateDetailedPlan(
  request: PlanningRequest,
  options: DetailedGenerationOptions = {},
): GeneratedDetailedPlan {
  const solution = solveSteadyState(request);
  const topology = topologyFor(
    processNodes(request, solution.activities, true),
  );
  const tiers = allowedTiers(options);
  const connections: PhysicalConnection[] = topology.connections.map(
    ({ from, id, itemId, to }) => {
      const medium =
        findDescriptor(itemId)?.form === "solid" ? "conveyor" : "pipeline";
      const tier = largestTier(tiers, medium);
      return medium === "conveyor"
        ? { from, id, kind: "conveyor", tierId: tier.id, to }
        : { from, id, kind: "pipeline", tierId: tier.id, to };
    },
  );
  const nodes: DetailedNode[] = topology.nodes.map((node) => ({ ...node }));
  return { plan: createDetailedPlan({ connections, nodes, tiers }), solution };
}
