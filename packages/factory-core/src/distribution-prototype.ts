/* oxlint-disable unicorn/consistent-function-scoping -- Keep this disposable generator self-contained. */
/** Throwaway distribution experiment. No factory state or persistence.
 * Equal 2/3-way splits; spare leaves return upstream through a merger.
 * https://satisfactory.wiki.gg/wiki/Balancer
 */
export const PREVIEW_BELTS = [60, 120, 270, 480, 780, 1200] as const;
export type DistributionEndpoint = { id: string; rate: number };
export type DistributionNode = {
  id: string;
  kind: "source" | "destination" | "splitter" | "merger";
};
export type DistributionEdge = {
  id: string;
  from: string;
  to: string;
  rate: number;
  tier: number;
  feedback?: boolean;
};
export type DistributionPreview = {
  nodes: DistributionNode[];
  edges: DistributionEdge[];
  error?: string;
};
type Stream = { from: string; rate: number };

export function buildDistributionPrototype(
  sources: readonly DistributionEndpoint[],
  destinations: readonly DistributionEndpoint[],
  maxTier: number,
  mode: "balanced" | "manifold",
): DistributionPreview {
  const nodes: DistributionNode[] = [];
  const edges: DistributionEdge[] = [];
  const capacity = PREVIEW_BELTS[maxTier - 1] ?? 0;
  const epsilon = 0.00001;
  const sum = (values: readonly { rate: number }[]) =>
    values.reduce((total, entry) => total + entry.rate, 0);
  const fail = (error: string): DistributionPreview => ({ nodes: [], edges: [], error });
  if (
    !sources.length ||
    !destinations.length ||
    sources.some((s) => s.rate <= 0) ||
    destinations.some((s) => s.rate <= 0)
  )
    return fail("Connect machines with a positive flow to preview their distribution.");
  if (sources.length + destinations.length > 100)
    return fail("This experiment supports up to 100 machines at a time.");
  if (Math.abs(sum(sources) - sum(destinations)) > epsilon)
    return fail("Supply and destination rates do not match.");
  if ([...sources, ...destinations].some((entry) => entry.rate > capacity + epsilon))
    return fail(
      `One machine port exceeds Mk.${maxTier} (${capacity}/min). Select a higher maximum belt tier.`,
    );
  sources.forEach((s) => nodes.push({ id: s.id, kind: "source" }));
  destinations.forEach((s) => nodes.push({ id: s.id, kind: "destination" }));
  const junction = (kind: "splitter" | "merger") => {
    const id = `junction-${nodes.length}`;
    nodes.push({ id, kind });
    return id;
  };
  const connect = (stream: Stream, to: string, feedback = false) => {
    const tier = PREVIEW_BELTS.findIndex((cap) => stream.rate <= cap + epsilon) + 1;
    edges.push({
      id: `belt-${edges.length}`,
      from: stream.from,
      to,
      rate: stream.rate,
      tier,
      feedback,
    });
  };
  const merge = (values: Stream[]): Stream => {
    let pending = values;
    while (pending.length > 1) {
      const next: Stream[] = [];
      for (let i = 0; i < pending.length; i += 3) {
        const group = pending.slice(i, i + 3);
        if (group.length === 1) {
          next.push(group[0]!);
          continue;
        }
        const id = junction("merger");
        group.forEach((s) => connect(s, id));
        next.push({ from: id, rate: sum(group) });
      }
      pending = next;
    }
    return pending[0]!;
  };
  const received = new Map(destinations.map((d) => [d.id, [] as Stream[]]));
  // Pack sources into independent lanes; never introduce a trunk exceeding the belt tier.
  const lanes: Stream[][] = [];
  for (const source of sources) {
    const stream = { from: source.id, rate: source.rate };
    const lane = lanes.find((values) => sum(values) + stream.rate <= capacity + epsilon);
    if (lane) lane.push(stream);
    else lanes.push([stream]);
  }
  const remaining = destinations.map((d) => ({ ...d }));
  for (const lane of lanes) {
    let stream = merge(lane);
    let left = stream.rate;
    const allocations: DistributionEndpoint[] = [];
    for (const target of remaining) {
      const rate = Math.min(left, target.rate);
      if (rate > epsilon) allocations.push({ id: target.id, rate });
      target.rate -= rate;
      left -= rate;
    }
    if (mode === "manifold") {
      for (let i = 0; i < allocations.length; i++) {
        const target = allocations[i]!;
        if (i < allocations.length - 1) {
          const id = junction("splitter");
          connect(stream, id);
          received.get(target.id)!.push({ from: id, rate: target.rate });
          stream = { from: id, rate: stream.rate - target.rate };
        } else received.get(target.id)!.push(stream);
      }
      continue;
    }
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
        "This rate ratio needs a larger balancer than the experiment supports. Try Manifold.",
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
        `The feedback loop needs ${Number((slots * quantum).toFixed(3))}/min on its trunk. Raise the belt tier or try Manifold.`,
      );
    const leaves = allocations.flatMap((a, i) => Array<string>(units[i]!).fill(a.id));
    const returns: Stream[] = [];
    let feedback: string | undefined;
    if (slots > count) {
      feedback = junction("merger");
      connect(stream, feedback);
      stream = { from: feedback, rate: slots * quantum };
      leaves.push(...Array<string>(slots - count).fill("return"));
    }
    const split = (input: Stream, outputs: string[]) => {
      if (outputs.every((id) => id === outputs[0])) {
        (outputs[0] === "return" ? returns : received.get(outputs[0]!)!).push(input);
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
  for (const [id, streams] of received) connect(merge(streams), id);
  if (edges.some((edge) => !edge.tier || edge.tier > maxTier))
    return fail("This layout exceeds the selected belt capacity.");
  return { nodes, edges };
}
