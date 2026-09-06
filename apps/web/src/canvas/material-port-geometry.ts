import { createNode, type MaterialPort } from "@satisfactory-belt/production";

import { createNodeCardModel } from "./node-card-model";
import { nodeCardLayout, nodeCardPortY } from "./node-card-layout";
import type { CanvasNode } from "./document";
import type { Point } from "./geometry";

export type CanvasMaterialPort = Readonly<{
  nodeId: string;
  point: Point;
  port: MaterialPort;
  side: "left" | "right";
}>;

export function materialPortGeometry(
  node: CanvasNode,
): readonly CanvasMaterialPort[] {
  const resolved = createNode(node.configuration);
  const model = createNodeCardModel(node);
  const layout = nodeCardLayout(node.configuration);
  const build = (side: "left" | "right", entries: typeof model.leftPorts) =>
    entries.flatMap((entry, index) => {
      const port = resolved.ports.find(({ id }) => id === entry.portId);
      return port
        ? [
            {
              nodeId: node.configuration.id,
              point: {
                x: side === "left" ? node.x : node.x + node.width,
                y: node.y + nodeCardPortY(layout, index, entries.length),
              },
              port,
              side,
            } as const,
          ]
        : [];
    });
  return [
    ...build("left", model.leftPorts),
    ...build("right", model.rightPorts),
  ];
}

export function hitTestMaterialPort(
  nodes: readonly CanvasNode[],
  point: Point,
  radius: number,
) {
  let hit: CanvasMaterialPort | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    for (const candidate of materialPortGeometry(node)) {
      const candidateDistance = Math.hypot(
        point.x - candidate.point.x,
        point.y - candidate.point.y,
      );
      if (candidateDistance <= radius && candidateDistance < distance) {
        hit = candidate;
        distance = candidateDistance;
      }
    }
  }
  return hit;
}
