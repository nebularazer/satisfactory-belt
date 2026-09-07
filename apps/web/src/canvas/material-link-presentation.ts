import { createNode, findDescriptor } from "@satisfactory-belt/production";
import {
  analyzeBasicFlows,
  createBasicPlan,
  type MaterialEndpoint,
  type OperationalDiagnostic,
} from "@satisfactory-belt/planning";

import type { CanvasDocument } from "./document";
import {
  classifyMaterialFlowState,
  type MaterialFlowState,
} from "./material-flow-state";
import { createNodeCardModel } from "./node-card-model";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export type MaterialLinkPresentation = Readonly<{
  diagnostics: readonly OperationalDiagnostic[];
  from: Readonly<{ nodeLabel: string; portLabel: string }>;
  id: string;
  itemId?: string;
  itemName: string;
  label: string;
  ratePerMinute?: number;
  state: MaterialFlowState;
  to: Readonly<{ nodeLabel: string; portLabel: string }>;
  unit: "items/min" | "m³/min";
}>;

export type MaterialPortPresentation = Readonly<{
  itemId?: string;
  ratePerMinute?: number;
}>;

export type MaterialFlowPresentation = Readonly<{
  links: readonly MaterialLinkPresentation[];
  port: (endpoint: MaterialEndpoint) => MaterialPortPresentation | undefined;
}>;

function endpointPresentation(
  node: CanvasDocument["nodes"][number] | undefined,
  portId: string,
  itemName: string,
) {
  const port = node
    ? createNode(node.configuration).ports.find(({ id }) => id === portId)
    : undefined;
  const direction =
    port?.direction === "input"
      ? "Input"
      : port?.direction === "output"
        ? "Output"
        : "Port";
  return {
    nodeLabel: node ? createNodeCardModel(node).title : "Missing node",
    portLabel: `${direction} · ${itemName}`,
  };
}

const cache = new WeakMap<CanvasDocument, MaterialFlowPresentation>();

function endpointKey(endpoint: MaterialEndpoint) {
  return `${endpoint.nodeId}\u0000${endpoint.portId}`;
}

export function presentMaterialFlow(
  document: CanvasDocument,
): MaterialFlowPresentation {
  const cached = cache.get(document);
  if (cached) return cached;
  const plan = createBasicPlan({
    materialLinks: document.materialLinks,
    nodes: document.nodes.map(({ configuration }) => configuration),
  });
  const analysis = analyzeBasicFlows(plan);
  const flowByLink = new Map(
    analysis.linkFlows.map((flow) => [flow.linkId, flow]),
  );
  const nodeById = new Map(
    document.nodes.map((node) => [node.configuration.id, node]),
  );
  const links = document.materialLinks.map((link) => {
    const flow = flowByLink.get(link.id);
    const descriptor = flow?.itemId ? findDescriptor(flow.itemId) : undefined;
    const diagnostics = analysis.diagnostics.filter(
      ({ connectionId }) => connectionId === link.id,
    );
    const itemName = descriptor?.name ?? "Unresolved material";
    return {
      diagnostics,
      from: endpointPresentation(
        nodeById.get(link.from.nodeId),
        link.from.portId,
        itemName,
      ),
      id: link.id,
      ...(flow?.itemId ? { itemId: flow.itemId } : {}),
      itemName,
      label:
        flow?.ratePerMinute === undefined
          ? "—"
          : numberFormatter.format(flow.ratePerMinute),
      ...(flow?.ratePerMinute === undefined
        ? {}
        : { ratePerMinute: flow.ratePerMinute }),
      state: classifyMaterialFlowState(
        diagnostics.map(({ code }) => code),
        flow?.ratePerMinute !== undefined && descriptor !== undefined,
      ),
      to: endpointPresentation(
        nodeById.get(link.to.nodeId),
        link.to.portId,
        itemName,
      ),
      unit: descriptor?.form === "solid" ? "items/min" : "m³/min",
    } as const;
  });
  const portByEndpoint = new Map(
    analysis.portFlows.map(({ endpoint, itemId, ratePerMinute }) => [
      endpointKey(endpoint),
      {
        ...(itemId ? { itemId } : {}),
        ...(ratePerMinute === undefined ? {} : { ratePerMinute }),
      },
    ]),
  );
  const presentation = {
    links,
    port: (endpoint: MaterialEndpoint) =>
      portByEndpoint.get(endpointKey(endpoint)),
  };
  cache.set(document, presentation);
  return presentation;
}

export function presentMaterialLinks(
  document: CanvasDocument,
): readonly MaterialLinkPresentation[] {
  return presentMaterialFlow(document).links;
}
