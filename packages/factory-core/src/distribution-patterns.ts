/** Small arithmetic constructions, with a fixed budget instead of optimality search. */
import { FLOW_EPSILON, cheaperCost } from "./distribution-graph";

const MAX_UNITS = 1_000_000;
const MAX_STATES = 1_200;
const MAX_JUNCTIONS = 256;

export type DistributionPattern =
  | { kind: "delivery"; units: number; target: number }
  | { kind: "split"; units: number; children: DistributionPattern[] }
  | { kind: "feedback"; units: number; returnTarget: number; child: DistributionPattern };

type Pattern = {
  tree: DistributionPattern;
  junctions: number;
  belts: number;
  feedbacks: number;
  deliveries: number[];
};
const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0);
const mergers = (count: number) => Math.max(0, Math.ceil((count - 1) / 2));
function cost(pattern: Pattern): readonly number[] {
  const deliveryMergers = total(pattern.deliveries.map(mergers));
  return [pattern.junctions + deliveryMergers, pattern.belts + deliveryMergers, pattern.feedbacks];
}

function describe(tree: DistributionPattern): Pattern {
  if (tree.kind === "delivery") {
    const deliveries: number[] = Array<number>(tree.target + 1).fill(0);
    deliveries[tree.target] = 1;
    return { tree, junctions: 0, belts: 1, feedbacks: 0, deliveries };
  }
  if (tree.kind === "feedback") {
    const child = describe(tree.child);
    const deliveries = [...child.deliveries];
    const returnMergers = mergers(deliveries[tree.returnTarget] ?? 0);
    const junctions = child.junctions + 1 + returnMergers;
    deliveries[tree.returnTarget] = 0;
    return {
      tree,
      junctions,
      deliveries,
      belts: child.belts + 1 + returnMergers,
      feedbacks: child.feedbacks + 1,
    };
  }
  const deliveries: number[] = [];
  let junctions = 1;
  let belts = 1;
  let feedbacks = 0;
  for (const branch of tree.children) {
    const child = describe(branch);
    junctions += child.junctions;
    belts += child.belts;
    feedbacks += child.feedbacks;
    child.deliveries.forEach((count, target) => {
      while (deliveries.length <= target) deliveries.push(0);
      deliveries[target] = (deliveries[target] ?? 0) + count;
    });
  }
  return { tree, junctions, deliveries, belts, feedbacks };
}

/** Assemble equal-sized branches, collapsing any complete delivery along the way. */
function join(branches: DistributionPattern[]): DistributionPattern {
  if (branches.length === 1) return branches[0]!;
  const first = branches[0]!;
  const units = total(branches.map((branch) => branch.units));
  if (
    first.kind === "delivery" &&
    branches.every((branch) => branch.kind === "delivery" && branch.target === first.target)
  )
    return { kind: "delivery", target: first.target, units };
  let best: DistributionPattern | undefined;
  for (const arity of [2, 3]) {
    if (branches.length % arity) continue;
    const size = branches.length / arity;
    const candidate: DistributionPattern = {
      kind: "split",
      units,
      children: Array.from({ length: arity }, (_, i) =>
        join(branches.slice(i * size, (i + 1) * size)),
      ),
    };
    if (!best || cheaperCost(cost(describe(candidate)), cost(describe(best)))) best = candidate;
  }
  return best!;
}

function smoothNumbers(factors: number[]): number[] {
  const values: number[] = [];
  const visit = (value: number, index: number) => {
    if (index === factors.length) {
      values.push(value);
      return;
    }
    for (let next = value; next <= MAX_UNITS; next *= factors[index]!) visit(next, index + 1);
  };
  visit(1, 0);
  return values.toSorted((a, b) => a - b);
}

const ordinaryTotals = smoothNumbers([2, 3]);
const templateTotals = smoothNumbers([2, 3, 5, 7]);

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Continued fractions preserve common fractional clocks without rounding to items/min. */
function fraction(value: number, tolerance: number): [number, number] | undefined {
  let remainder = value;
  let previousNumerator = 0,
    numerator = 1;
  let previousDenominator = 1,
    denominator = 0;
  for (let step = 0; step < 32; step++) {
    const whole = Math.floor(remainder);
    const nextNumerator = whole * numerator + previousNumerator;
    const nextDenominator = whole * denominator + previousDenominator;
    if (!Number.isSafeInteger(nextNumerator) || nextDenominator > 10_000) return undefined;
    if (Math.abs(nextNumerator / nextDenominator - value) <= tolerance)
      return [nextNumerator, nextDenominator];
    [previousNumerator, numerator] = [numerator, nextNumerator];
    [previousDenominator, denominator] = [denominator, nextDenominator];
    remainder = 1 / (remainder - whole);
  }
  return undefined;
}

export function distributionUnits(rates: readonly number[]): number[] | undefined {
  const minimum = Math.min(...rates);
  const fractions: [number, number][] = [];
  let denominator = 1;
  for (const rate of rates) {
    // LP allocations can differ from simple ratios by tiny solver tolerances.
    // Recognize those ratios; the finished graph is still validated against the
    // original, unrounded endpoint rates before it can be shown.
    const ratio = fraction(rate / minimum, FLOW_EPSILON / 10 / minimum);
    if (!ratio) return undefined;
    fractions.push(ratio);
    denominator = (denominator / gcd(denominator, ratio[1])) * ratio[1];
    if (!Number.isSafeInteger(denominator) || denominator > MAX_UNITS) return undefined;
  }
  const units = fractions.map(([n, d]) => n * (denominator / d));
  if (units.some((value) => !Number.isSafeInteger(value) || value <= 0)) return undefined;
  const divisor = units.reduce(gcd);
  const reduced = units.map((value) => value / divisor);
  return total(reduced) <= MAX_UNITS ? reduced : undefined;
}

/** Fill equal branches with large useful chunks; only residual demands get split further. */
function partition(demands: readonly number[], arity: number, strategy: number): number[][] {
  const remaining = [...demands];
  const size = total(demands) / arity;
  return Array.from({ length: arity }, () => {
    const branch = demands.map(() => 0);
    let space = size;
    while (space > 0) {
      const available = remaining
        .map((rate, index) => ({ rate, index }))
        .filter(({ rate }) => rate > 0);
      available.sort((a, b) => {
        const rank = (rate: number) => (rate === space ? 0 : rate >= space ? 1 : 2);
        return (
          rank(a.rate) - rank(b.rate) ||
          (strategy === 0 ? b.rate - a.rate : strategy === 1 ? a.rate - b.rate : a.index - b.index)
        );
      });
      const target = available[0]!.index;
      const take = Math.min(space, remaining[target]!);
      branch[target]! += take;
      remaining[target]! -= take;
      space -= take;
    }
    return branch;
  });
}

/** Cache lifetime and exploration budget are per preview, not unbounded global state. */
export class DistributionPatterns {
  private remainingConstructionStates = MAX_STATES;
  private remainingImprovementStates = MAX_STATES;
  private readonly cache = new Map<string, Pattern | undefined>();

  solve(
    demands: readonly number[],
    capacity: number,
    optimize: boolean,
  ): DistributionPattern | undefined {
    return this.find(demands, capacity, true, optimize)?.tree;
  }

  private find(
    demands: readonly number[],
    capacity: number,
    allowFeedback: boolean,
    optimize: boolean,
  ): Pattern | undefined {
    const units = total(demands);
    const target = demands.findIndex((value) => value === units);
    if (target >= 0) return describe({ kind: "delivery", units, target });
    const problem = `${capacity}:${allowFeedback}:${demands.join(",")}`;
    const key = `${optimize}:${problem}`;
    if (this.cache.has(key)) return this.cache.get(key);
    let best = optimize ? this.find(demands, capacity, allowFeedback, false) : undefined;
    if (optimize ? this.remainingImprovementStates-- <= 0 : this.remainingConstructionStates-- <= 0)
      return best;
    const consider = (tree: DistributionPattern) => {
      const candidate = describe(tree);
      if (
        cost(candidate)[0]! <= MAX_JUNCTIONS &&
        (!best || cheaperCost(cost(candidate), cost(best)))
      )
        best = candidate;
    };
    for (const arity of [2, 3, 5, 7]) {
      if (units % arity) continue;
      const trunk = arity <= 3 ? units : (units * (arity + 1)) / arity;
      if (trunk > capacity + 1e-8) continue;
      const tried = new Set<string>();
      for (let strategy = 0; strategy < 3; strategy++) {
        const groups = partition(demands, arity, strategy);
        const signature = groups.map((group) => group.join(",")).join(";");
        if (tried.has(signature)) continue;
        tried.add(signature);
        const children: DistributionPattern[] = [];
        for (const group of groups) {
          const child = this.find(group, capacity, allowFeedback, optimize);
          if (!child) break;
          children.push(child.tree);
        }
        if (children.length !== arity) continue;
        if (arity <= 3) consider(join(children));
        else {
          // Five outputs from six slots, or seven from eight. The unused slot
          // returns to this local inlet, not necessarily the whole network inlet.
          const returnTarget = demands.length;
          consider({
            kind: "feedback",
            units,
            returnTarget,
            child: join([
              ...children,
              { kind: "delivery", units: units / arity, target: returnTarget },
            ]),
          });
        }
        if (!optimize && best) {
          this.cache.set(key, best);
          return best;
        }
      }
    }
    if (allowFeedback && (!best || !ordinaryTotals.includes(units))) {
      const totals = new Set([
        ...ordinaryTotals.filter((value) => value > units).slice(0, 2),
        ...templateTotals.filter((value) => value > units).slice(0, 1),
      ]);
      for (const lifted of totals) {
        if (lifted > capacity + 1e-8) continue;
        // No further arbitrary lift inside this construction; local 5/7 patterns
        // still work. This prevents recursively growing feedback searches.
        const child = this.find([...demands, lifted - units], capacity, false, optimize);
        if (child)
          consider({ kind: "feedback", units, returnTarget: demands.length, child: child.tree });
        if (!optimize && best) {
          this.cache.set(key, best);
          return best;
        }
      }
    }
    this.cache.set(key, best);
    return best;
  }
}
