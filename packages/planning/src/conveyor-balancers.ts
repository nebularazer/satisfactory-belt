import { createNode } from "@satisfactory-belt/production";
import { analyzeBasicFlows } from "./basic-flow-analysis";
import { createBasicPlan } from "./basic-topology";
import {
  assertDetailedNodeConfiguration,
  createDetailedPlan,
} from "./detailed-plan";
import type {
  DetailedPlan,
  MaterialEndpoint,
  PhysicalConnection,
} from "./types";

const SPLITTER = "Build_ConveyorAttachmentSplitter_C";
const MERGER = "Build_ConveyorAttachmentMerger_C";

// Recover small integer ratios from calculated machine rates, without rounding
// each rate to an arbitrary number of decimal places.
function ratioWeights(rates: readonly number[]) {
  const total = rates.reduce((sum, rate) => sum + rate, 0);
  for (let denominator = 1; denominator <= 10_000; denominator++) {
    const weights = rates.map((rate) =>
      Math.round((rate / total) * denominator),
    );
    if (
      weights.every(
        (weight, index) =>
          weight > 0 &&
          Math.abs(weight / denominator - rates[index]! / total) < 1e-10,
      ) &&
      weights.reduce((sum, weight) => sum + weight, 0) === denominator
    )
      return weights;
  }
  throw new Error(
    "These rates need an impractically large conveyor balancer. Use simpler machine clocks or output ratios.",
  );
}

function smoothCeiling(count: number) {
  let best = Infinity;
  for (let two = 1; two < count * 2; two *= 2) {
    let candidate = two;
    while (candidate < count) candidate *= 3;
    best = Math.min(best, candidate);
  }
  return best;
}

/** Replace ordinary splitter trees with exact ratio balancers. Every connected
 * splitter output carries the same rate; mergers collect shares for consumers.
 * Non 2/3-factorable ratios return unused shares to the input via a merger.
 * Process configurations and external connection identities are preserved.
 */
export function balanceDetailedConveyors(plan: DetailedPlan): DetailedPlan {
  const flows = analyzeBasicFlows(
    createBasicPlan({
      nodes: plan.nodes,
      materialLinks: plan.connections,
    }),
    { projectUnconnectedOutputs: false },
  ).linkFlows;
  const flowById = new Map(flows.map((flow) => [flow.linkId, flow]));
  const nodes = new Map(
    plan.nodes.map((node) => [node.configuration.id, node]),
  );
  const connections = new Map(
    plan.connections.map((connection) => [connection.id, connection]),
  );
  const splitters = new Set(
    plan.nodes
      .filter(
        (node) =>
          node.configuration.buildableId === SPLITTER &&
          !node.routingRules?.length,
      )
      .map((node) => node.configuration.id),
  );
  const incoming = Map.groupBy(
    plan.connections,
    (connection) => connection.to.nodeId,
  );
  const outgoing = Map.groupBy(
    plan.connections,
    (connection) => connection.from.nodeId,
  );
  const roots = [...splitters].filter(
    (id) =>
      incoming.get(id)?.length === 1 &&
      !splitters.has(incoming.get(id)![0]!.from.nodeId),
  );
  let sequence = 0;
  const uniqueId = (prefix: string) => {
    let id: string;
    do {
      id = `${prefix}:balance:${++sequence}`;
    } while (nodes.has(id) || connections.has(id));
    return id;
  };
  const tiers = plan.tiers
    .filter((tier) => tier.medium === "conveyor")
    .toSorted((a, b) => a.capacityPerMinute - b.capacityPerMinute);
  const tierFor = (rate: number) => {
    const tier = tiers.find(
      (candidate) => candidate.capacityPerMinute + 1e-7 >= rate,
    );
    if (!tier)
      throw new Error(
        `The balancer needs a conveyor carrying ${Number(rate.toFixed(4))} items/min, above the available belt capacity. Reduce the production rate or split the supply into separate groups.`,
      );
    return tier.id;
  };

  for (const rootId of roots) {
    const tree = new Set<string>();
    const leaves: PhysicalConnection[] = [];
    const visit = (id: string) => {
      if (tree.has(id))
        throw new Error(
          "Cannot convert a cyclic splitter tree into a balancer.",
        );
      tree.add(id);
      for (const connection of outgoing.get(id) ?? []) {
        if (splitters.has(connection.to.nodeId)) visit(connection.to.nodeId);
        else leaves.push(connection);
      }
    };
    visit(rootId);
    const rates = leaves.map(
      (leaf) => flowById.get(leaf.id)?.ratePerMinute ?? 0,
    );
    if (leaves.length < 2 || rates.every((rate) => rate <= 1e-8)) continue;
    if (rates.some((rate) => rate <= 1e-8))
      throw new Error(
        "Every balancer destination needs a positive, resolved demand. Connect or remove unused branches before converting.",
      );
    const weights = ratioWeights(rates);
    const count = weights.reduce((sum, weight) => sum + weight, 0);
    const slots = smoothCeiling(count);
    const totalRate = rates.reduce((sum, rate) => sum + rate, 0);
    const unitRate = totalRate / count;
    tierFor(slots * unitRate);
    const itemId = flowById.get(leaves[0]!.id)?.itemId;
    const original = nodes.get(rootId)!;
    for (const id of tree) {
      nodes.delete(id);
      for (const connection of outgoing.get(id) ?? []) {
        if (tree.has(connection.to.nodeId)) connections.delete(connection.id);
      }
    }
    const addRouter = (buildableId: string, id = uniqueId(rootId)) => {
      const configuration = createNode({
        id,
        buildableId,
        itemId,
        kind: "router",
      }).configuration;
      assertDetailedNodeConfiguration(configuration);
      nodes.set(id, { configuration });
      return id;
    };
    const connect = (
      from: MaterialEndpoint,
      to: MaterialEndpoint,
      rate: number,
    ) => {
      const id = uniqueId(rootId);
      connections.set(id, {
        id,
        from,
        to,
        kind: "conveyor",
        tierId: tierFor(rate),
      });
    };
    type Share = { endpoint: MaterialEndpoint; rate: number };
    const shares: Share[][] = Array.from(
      { length: leaves.length + 1 },
      () => [],
    );
    const boundaries: number[] = [];
    let end = 0;
    for (const weight of [...weights, slots - count]) {
      end += weight;
      boundaries.push(end);
    }
    const targetAt = (slot: number) =>
      boundaries.findIndex((boundary) => slot < boundary);
    const split = (start: number, length: number, id: string) => {
      const arity = length % 3 === 0 ? 3 : 2;
      const size = length / arity;
      for (let index = 0; index < arity; index++) {
        const offset = start + index * size;
        const endpoint = { nodeId: id, portId: `output:${index + 1}` };
        const target = targetAt(offset);
        if (target === targetAt(offset + size - 1)) {
          shares[target]!.push({ endpoint, rate: size * unitRate });
        } else {
          const child = addRouter(SPLITTER);
          connect(
            endpoint,
            { nodeId: child, portId: "input:1" },
            size * unitRate,
          );
          split(offset, size, child);
        }
      }
    };
    addRouter(SPLITTER, rootId);
    nodes.set(rootId, {
      ...original,
      configuration: nodes.get(rootId)!.configuration,
    });
    split(0, slots, rootId);
    const merge = (inputs: Share[]): Share => {
      while (inputs.length > 1) {
        const next: Share[] = [];
        for (let index = 0; index < inputs.length; index += 3) {
          const group = inputs.slice(index, index + 3);
          if (group.length === 1) {
            next.push(group[0]!);
            continue;
          }
          const id = addRouter(MERGER);
          group.forEach((share, port) =>
            connect(
              share.endpoint,
              { nodeId: id, portId: `input:${port + 1}` },
              share.rate,
            ),
          );
          next.push({
            endpoint: { nodeId: id, portId: "output:1" },
            rate: group.reduce((sum, share) => sum + share.rate, 0),
          });
        }
        inputs = next;
      }
      return inputs[0]!;
    };
    leaves.forEach((leaf, index) => {
      const share = merge(shares[index]!);
      connections.set(leaf.id, {
        ...connections.get(leaf.id)!,
        from: share.endpoint,
        tierId: tierFor(share.rate),
      });
    });
    if (slots > count) {
      const feedback = merge(shares[leaves.length]!);
      const inlet = addRouter(MERGER);
      const input = incoming.get(rootId)![0]!;
      connections.set(input.id, {
        ...connections.get(input.id)!,
        to: { nodeId: inlet, portId: "input:1" },
      });
      connect(
        feedback.endpoint,
        { nodeId: inlet, portId: "input:2" },
        feedback.rate,
      );
      connect(
        { nodeId: inlet, portId: "output:1" },
        { nodeId: rootId, portId: "input:1" },
        slots * unitRate,
      );
    }
  }
  return createDetailedPlan({
    ...plan,
    nodes: [...nodes.values()],
    connections: [...connections.values()],
  });
}
