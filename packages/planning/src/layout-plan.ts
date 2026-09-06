import { resolveDetailedPlan } from "./detailed-plan";
import type {
  DetailedPlan,
  LayoutPlan,
  PlanPosition,
  RoutedConnection,
} from "./types";

export function createLayoutPlan(
  request: Readonly<{
    detailedPlan: DetailedPlan;
    positions: Readonly<Record<string, PlanPosition>>;
    routes?: readonly RoutedConnection[];
  }>,
): LayoutPlan {
  const detailedPlan = resolveDetailedPlan(request.detailedPlan).plan;
  const nodeIds = new Set(
    detailedPlan.nodes.map(({ configuration }) => configuration.id),
  );
  for (const nodeId of nodeIds) {
    const position = request.positions[nodeId];
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      throw new Error(
        `Layout position for Detailed Node ${nodeId} is missing or invalid.`,
      );
    }
  }
  for (const nodeId of Object.keys(request.positions)) {
    if (!nodeIds.has(nodeId)) {
      throw new Error(`Layout position references unknown Node ${nodeId}.`);
    }
  }
  const connectionIds = new Set(detailedPlan.connections.map(({ id }) => id));
  const routedIds = new Set<string>();
  const routes = request.routes ?? [];
  for (const route of routes) {
    if (!connectionIds.has(route.connectionId)) {
      throw new Error(
        `Layout route references unknown connection ${route.connectionId}.`,
      );
    }
    if (routedIds.has(route.connectionId)) {
      throw new Error(
        `Layout connection ${route.connectionId} has duplicate routes.`,
      );
    }
    if (
      route.points.some(
        ({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y),
      )
    ) {
      throw new Error(
        `Layout route ${route.connectionId} contains an invalid point.`,
      );
    }
    routedIds.add(route.connectionId);
  }
  return {
    detailedPlan,
    kind: "layout",
    positions: request.positions,
    routes,
    version: 1,
  };
}
