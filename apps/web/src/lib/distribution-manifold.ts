import type { Point } from "@satisfactory-belt/canvas-core";
import type { DistributionResult } from "@satisfactory-belt/factory-core";

function stationIndices(graph: DistributionResult) {
  const indices = new Map<string, number>();
  for (const [index, station] of graph.pipeManifold!.stations.entries()) {
    indices.set(station.destinationId, index);
    if (station.junctionId) indices.set(station.junctionId, index);
  }
  return indices;
}

/** Physical neighbors determine socket sides, independently of net flow direction. */
export function manifoldSockets(graph: DistributionResult, nodeId: string, size: number) {
  const indices = stationIndices(graph);
  const index = indices.get(nodeId)!;
  const incident = graph.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
  let feeds = 0;
  return incident.map((edge) => {
    const other = edge.from === nodeId ? edge.to : edge.from;
    const station = indices.get(other);
    const side =
      station === undefined
        ? feeds++ === 0
          ? "west"
          : index === 0
            ? "north"
            : "south"
        : station === index
          ? "east"
          : station < index
            ? "north"
            : "south";
    return {
      edge,
      x: side === "west" ? 0 : side === "east" ? size : size / 2,
      y: side === "north" ? 0 : side === "south" ? size : size / 2,
    };
  });
}

/** Keep taps in physical header order instead of layering by directed flow. */
export function manifoldPositions(graph: DistributionResult) {
  const positions = new Map<string, Point>();
  const stationIds = new Set(stationIndices(graph).keys());
  for (const [index, station] of graph.pipeManifold!.stations.entries()) {
    const y = 32 + index * 320;
    positions.set(station.destinationId, { x: 512, y });
    if (!station.junctionId) continue;
    positions.set(station.junctionId, { x: 384, y: y + 64 });
    const feeds = graph.edges.filter(
      (edge) => edge.to === station.junctionId && !stationIds.has(edge.from),
    );
    for (const [offset, edge] of feeds.entries())
      positions.set(edge.from, { x: 32, y: y + offset * (index === 0 ? -320 : 320) });
  }
  const shift = 32 - Math.min(...[...positions.values()].map((point) => point.y));
  for (const [id, position] of positions)
    positions.set(id, { x: position.x, y: position.y + shift });
  return positions;
}

/** Straight header segments and short orthogonal branches, without crossovers. */
export function manifoldRoute(source: Point, target: Point, sourceIsSupply: boolean): Point[] {
  if (source.x === target.x || source.y === target.y) return [source, target];
  return [
    source,
    sourceIsSupply ? { x: target.x, y: source.y } : { x: source.x, y: target.y },
    target,
  ];
}

export function manifoldLabel(points: readonly Point[]): Point {
  let midpoint = points[0]!;
  let longest = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!,
      b = points[index]!;
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (length <= longest) continue;
    longest = length;
    midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return midpoint;
}
