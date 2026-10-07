/* oxlint-disable unicorn/consistent-function-scoping -- Keep distribution generation self-contained. */
/** Read-only distribution generation. No factory state or persistence.
 * Equal 2/3-way splits; spare leaves return upstream through a merger.
 * https://satisfactory.wiki.gg/wiki/Balancer
 */
import { compactDistribution } from "./distribution-compact";
import {
  FLOW_EPSILON,
  DISTRIBUTION_BELTS,
  DistributionGraph,
  distributionFailure,
  validateDistribution,
  cheaperCost,
  distributionCost,
  distributionCapacities,
} from "./distribution-graph";
import type {
  DistributionEndpoint,
  DistributionResult,
  DistributionTransport,
} from "./distribution-graph";
import { groupedDistribution } from "./distribution-grouped";
import { pipeDistribution } from "./distribution-pipes";

export {
  DISTRIBUTION_BELTS,
  DISTRIBUTION_PIPES,
  distributionCapacities,
  distributionFailure,
} from "./distribution-graph";
export type {
  DistributionEndpoint,
  DistributionNode,
  DistributionEdge,
  DistributionResult,
  DistributionRequest,
  DistributionErrorCode,
  DistributionTransport,
} from "./distribution-graph";
type Stream = { from: string; rate: number };

export function buildDistribution(
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  maxTier: number,
  transport: DistributionTransport = "belt",
): DistributionResult {
  const capacities = distributionCapacities(transport);
  const connection = transport === "pipe" ? "pipe" : "belt";
  const capacity = capacities[maxTier - 1] ?? 0;
  const epsilon = FLOW_EPSILON;
  const sum = (values: readonly { rate: number }[]) =>
    values.reduce((total, entry) => total + entry.rate, 0);
  const fail = (error: string) => distributionFailure("invalid-input", error);
  if (
    !sources.length ||
    !destinations.length ||
    sources.some((s) => !Number.isFinite(s.rate) || s.rate <= 0) ||
    destinations.some((s) => !Number.isFinite(s.rate) || s.rate <= 0)
  )
    return fail("Connect machines with a positive flow to preview their distribution.");
  if (sources.length + destinations.length > 100)
    return distributionFailure(
      "endpoint-limit",
      "Distribution supports up to 100 suppliers and consumers combined. Use Connected nodes to keep machine groups together.",
    );
  if (!Number.isInteger(maxTier) || capacity === 0)
    return fail(`Select a maximum ${connection} tier from Mk.1 to Mk.${capacities.length}.`);
  if (
    new Set([...sources, ...destinations].map((entry) => entry.id)).size !==
    sources.length + destinations.length
  )
    return fail("Distribution endpoints must have distinct IDs.");
  if (Math.abs(sum(sources) - sum(destinations)) > epsilon)
    return fail("Supply and destination rates do not match.");
  if ([...sources, ...destinations].some((entry) => entry.rate > capacity + epsilon))
    return distributionFailure(
      "capacity",
      `One endpoint exceeds Mk.${maxTier} (${capacity}${transport === "pipe" ? " m³" : ""}/min). Select a higher maximum ${connection} tier.`,
    );
  let result =
    transport === "pipe"
      ? pipeDistribution(sources, destinations, maxTier)
      : buildFlatDistribution(sources, destinations, maxTier);
  const grouped =
    transport === "belt" && (result.error || distributionCost(result)[0] !== 0)
      ? groupedDistribution(sources, destinations, maxTier, buildFlatDistribution)
      : undefined;
  if (
    grouped &&
    validateDistribution(grouped, sources, destinations, maxTier) &&
    (result.error || cheaperCost(distributionCost(grouped), distributionCost(result)))
  )
    result = grouped;
  if (result.error) return result;
  return validateDistribution(result, sources, destinations, maxTier, transport)
    ? result
    : distributionFailure(
        "invalid-result",
        `The generated distribution failed its flow checks. Try another ${connection} tier.`,
      );
}

function buildFlatDistribution(
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  maxTier: number,
): DistributionResult {
  return compactDistribution(
    sources,
    destinations,
    maxTier,
    buildBaseline(sources, destinations, maxTier),
  );
}

/** Cheap established construction, retained as a candidate. */
function buildBaseline(
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  maxTier: number,
): DistributionResult {
  const graph = new DistributionGraph(sources, destinations);
  const { nodes, edges } = graph;
  const capacity = DISTRIBUTION_BELTS[maxTier - 1]!;
  const epsilon = FLOW_EPSILON;
  const fail = (error: string) => distributionFailure("construction-limit", error);
  const junction = (kind: "splitter" | "merger") => graph.junction(kind);
  const connect = (stream: Stream, to: string, feedback = false) =>
    graph.connect(stream, to, feedback);
  const merge = (values: Stream[]) => graph.merge(values);
  // Preserve one-to-one rate matches before pooling any supply. A 30/min source
  // feeding a 30/min consumer needs one belt, not a merge-and-split network.
  const remaining = destinations.map((destination) => ({ ...destination }));
  const unmatchedSources: DistributionEndpoint[] = [];
  for (const source of sources) {
    const index = remaining.findIndex(
      (destination) => Math.abs(destination.rate - source.rate) <= epsilon,
    );
    if (index === -1) unmatchedSources.push(source);
    else {
      const [destination] = remaining.splice(index, 1);
      connect({ from: source.id, rate: source.rate }, destination!.id);
    }
  }
  const received = new Map(remaining.map((destination) => [destination.id, [] as Stream[]]));
  // Split each supplier independently. Merge only where a consumer needs
  // contributions from multiple suppliers (or where a return loop rejoins).
  for (const source of unmatchedSources) {
    let stream = { from: source.id, rate: source.rate };
    let left = stream.rate;
    const allocations: DistributionEndpoint[] = [];
    for (const target of remaining) {
      const rate = Math.min(left, target.rate);
      if (rate > 0) allocations.push({ id: target.id, rate });
      target.rate -= rate;
      left -= rate;
    }
    if (!allocations.length)
      return fail("Could not allocate the remaining supply. Check the flow rates.");
    // Find a small integer ratio without rounding user rates to whole items.
    let units: number[] | undefined;
    const minimum = Math.min(...allocations.map((a) => a.rate));
    for (let divisor = 1; divisor <= 81; divisor++) {
      const quantum = minimum / divisor;
      const candidate = allocations.map((a) => Math.round(a.rate / quantum));
      if (candidate.reduce((a, b) => a + b, 0) > 81) break;
      if (allocations.every((a, i) => Math.abs(a.rate - candidate[i]! * quantum) < epsilon)) {
        units = candidate;
        break;
      }
    }
    if (!units)
      return fail(
        "No balanced construction was found within the construction limits. Try a higher belt tier.",
      );
    const count = units.reduce((a, b) => a + b, 0);
    let slots = count;
    const smooth = (n: number) => {
      while (n % 2 === 0) n /= 2;
      while (n % 3 === 0) n /= 3;
      return n === 1;
    };
    while (!smooth(slots)) slots++;
    const quantum = stream.rate / count;
    if (slots * quantum > capacity + epsilon)
      return fail(
        `The feedback loop needs ${Number((slots * quantum).toFixed(3))}/min on its trunk. Raise the belt tier.`,
      );
    const returnLeaf = Symbol("return");
    const leaves: (string | symbol)[] = allocations.flatMap((a, i) =>
      Array<string>(units[i]!).fill(a.id),
    );
    const returns: Stream[] = [];
    let feedback: string | undefined;
    if (slots > count) {
      feedback = junction("merger");
      connect(stream, feedback);
      stream = { from: feedback, rate: slots * quantum };
      leaves.push(...Array<symbol>(slots - count).fill(returnLeaf));
    }
    const split = (input: Stream, outputs: (string | symbol)[]) => {
      if (outputs.every((id) => id === outputs[0])) {
        (typeof outputs[0] === "symbol" ? returns : received.get(outputs[0]!)!).push(input);
        return;
      }
      const branches = outputs.length % 3 === 0 ? 3 : 2;
      const id = junction("splitter");
      connect(input, id);
      const size = outputs.length / branches;
      for (let i = 0; i < branches; i++)
        split({ from: id, rate: input.rate / branches }, outputs.slice(i * size, (i + 1) * size));
    };
    split(stream, leaves);
    if (feedback) connect(merge(returns), feedback, true);
  }
  for (const [id, streams] of received) {
    if (!streams.length) return fail("Could not allocate every destination. Check the flow rates.");
    connect(merge(streams), id);
  }
  if (edges.some((edge) => !edge.tier || edge.tier > maxTier))
    return distributionFailure("capacity", "This layout exceeds the selected belt capacity.");
  return { nodes, edges };
}
