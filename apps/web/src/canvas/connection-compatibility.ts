import { createNode, type NodeTemplate } from "@satisfactory-belt/production";
import {
  createBasicPlan,
  inspectMaterialConnectionTargets,
  type MaterialConnectionTarget,
  type MaterialEndpoint,
} from "@satisfactory-belt/planning";

import type { CanvasDocument } from "./document";

const CANDIDATE_NODE_ID = "canvas-compatible-node-candidate";

export function canvasDocumentForConnection(
  document: CanvasDocument,
  replacingLinkId?: string,
): CanvasDocument {
  if (!replacingLinkId) return document;
  return {
    ...document,
    materialLinks: document.materialLinks.filter(
      ({ id }) => id !== replacingLinkId,
    ),
  };
}

function asBasicPlan(document: CanvasDocument) {
  return createBasicPlan({
    materialLinks: document.materialLinks,
    nodes: document.nodes.map(({ configuration }) => configuration),
  });
}

export function canvasConnectionTargets(
  document: CanvasDocument,
  source: MaterialEndpoint,
  topology: "aggregate" | "physical" = "aggregate",
): readonly MaterialConnectionTarget[] {
  const targets = inspectMaterialConnectionTargets(
    asBasicPlan(document),
    source,
  );
  if (topology === "aggregate") return targets;

  const occupied = new Set(
    document.materialLinks.flatMap(({ from, to }) => [
      `${from.nodeId}\u0000${from.portId}`,
      `${to.nodeId}\u0000${to.portId}`,
    ]),
  );
  const sourceKey = `${source.nodeId}\u0000${source.portId}`;
  return targets.map((target) => {
    const key = `${target.endpoint.nodeId}\u0000${target.endpoint.portId}`;
    if (target.status === "source") return target;
    if (!occupied.has(sourceKey) && !occupied.has(key)) return target;
    return {
      endpoint: target.endpoint,
      error: {
        code: "basic.endpoint.occupied",
        message: occupied.has(sourceKey)
          ? "The source physical Material Port is already connected."
          : "This physical Material Port is already connected.",
      },
      status: "occupied",
    };
  });
}

export function compatibleTemplatePortIds(
  document: CanvasDocument,
  source: MaterialEndpoint,
  template: NodeTemplate,
  topology: "aggregate" | "physical" = "aggregate",
) {
  let candidateId = CANDIDATE_NODE_ID;
  const ids = new Set(
    document.nodes.map(({ configuration }) => configuration.id),
  );
  while (ids.has(candidateId)) candidateId += "-next";
  const candidate = createNode({ ...template, id: candidateId });
  return canvasConnectionTargets(
    {
      ...document,
      nodes: [
        ...document.nodes,
        {
          configuration: candidate.configuration,
          height: 1,
          label: "Candidate",
          width: 1,
          x: 0,
          y: 0,
        },
      ],
    },
    source,
    topology,
  )
    .filter(
      ({ endpoint, status }) =>
        endpoint.nodeId === candidateId && status === "compatible",
    )
    .map(({ endpoint }) => endpoint.portId);
}
