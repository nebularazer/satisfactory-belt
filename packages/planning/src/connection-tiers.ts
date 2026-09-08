import { analyzeDetailedPlan } from "./detailed-flow-analysis";
import type { DetailedPlan } from "./types";

/** Size generated connections after balancing, including circulating flow.
 * Keep the largest allowed tier on overload so validation reports the shortfall.
 * This is a generation step; manual tier choices are never rewritten.
 */
export function sizeDetailedConnections(plan: DetailedPlan): DetailedPlan {
  const rates = new Map<string, number>();
  for (const flow of analyzeDetailedPlan(plan).connectionFlows)
    rates.set(
      flow.connectionId,
      (rates.get(flow.connectionId) ?? 0) + flow.ratePerMinute,
    );
  const tiers = plan.tiers.toSorted(
    (a, b) =>
      a.capacityPerMinute - b.capacityPerMinute || a.id.localeCompare(b.id),
  );
  return {
    ...plan,
    connections: plan.connections.map((connection) => {
      const rate = rates.get(connection.id);
      if (rate === undefined) return connection;
      const available = tiers.filter((tier) => tier.medium === connection.kind);
      const tier =
        available.find((tier) => tier.capacityPerMinute + 1e-7 >= rate) ??
        available.at(-1)!;
      return { ...connection, tierId: tier.id };
    }),
  };
}
