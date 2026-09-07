import { createNode, type NodeTemplate } from "@satisfactory-belt/production";
import {
  createBasicPlan,
  inspectMaterialConnectionTargets,
  type MaterialConnectionTarget,
  type MaterialEndpoint,
} from "@satisfactory-belt/planning";

import type { CanvasDocument } from "./document";

const CANDIDATE_NODE_ID = "canvas-compatible-node-candidate";

function asBasicPlan(document: CanvasDocument) {
  return createBasicPlan({
    materialLinks: document.materialLinks,
    nodes: document.nodes.map(({ configuration }) => configuration),
  });
}

export function canvasConnectionTargets(
  document: CanvasDocument,
  source: MaterialEndpoint,
): readonly MaterialConnectionTarget[] {
  return inspectMaterialConnectionTargets(asBasicPlan(document), source);
}

export function compatibleTemplatePortIds(
  document: CanvasDocument,
  source: MaterialEndpoint,
  template: NodeTemplate,
) {
  let candidateId = CANDIDATE_NODE_ID;
  const ids = new Set(
    document.nodes.map(({ configuration }) => configuration.id),
  );
  while (ids.has(candidateId)) candidateId += "-next";
  const candidate = createNode({ ...template, id: candidateId });
  const plan = createBasicPlan({
    materialLinks: document.materialLinks,
    nodes: [
      ...document.nodes.map(({ configuration }) => configuration),
      candidate.configuration,
    ],
  });
  return inspectMaterialConnectionTargets(plan, source)
    .filter(
      ({ endpoint, status }) =>
        endpoint.nodeId === candidateId && status === "compatible",
    )
    .map(({ endpoint }) => endpoint.portId);
}
