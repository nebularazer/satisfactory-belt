import { findDescriptor } from "@satisfactory-belt/production";
import {
  analyzeBasicFlows,
  createBasicPlan,
  type OperationalDiagnostic,
} from "@satisfactory-belt/planning";

import type { CanvasDocument } from "./document";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export type MaterialLinkPresentation = Readonly<{
  diagnostics: readonly OperationalDiagnostic[];
  from: Readonly<{ nodeLabel: string; portId: string }>;
  id: string;
  itemId?: string;
  itemName: string;
  label: string;
  ratePerMinute?: number;
  to: Readonly<{ nodeLabel: string; portId: string }>;
  unit: "items/min" | "m³/min";
}>;

const cache = new WeakMap<
  CanvasDocument,
  readonly MaterialLinkPresentation[]
>();

export function presentMaterialLinks(
  document: CanvasDocument,
): readonly MaterialLinkPresentation[] {
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
  const presentations = document.materialLinks.map((link) => {
    const flow = flowByLink.get(link.id);
    const descriptor = flow?.itemId ? findDescriptor(flow.itemId) : undefined;
    return {
      diagnostics: analysis.diagnostics.filter(
        ({ connectionId }) => connectionId === link.id,
      ),
      from: {
        nodeLabel: nodeById.get(link.from.nodeId)?.label ?? link.from.nodeId,
        portId: link.from.portId,
      },
      id: link.id,
      ...(flow?.itemId ? { itemId: flow.itemId } : {}),
      itemName: descriptor?.name ?? "Unresolved material",
      label:
        flow?.ratePerMinute === undefined
          ? "—"
          : numberFormatter.format(flow.ratePerMinute),
      ...(flow?.ratePerMinute === undefined
        ? {}
        : { ratePerMinute: flow.ratePerMinute }),
      to: {
        nodeLabel: nodeById.get(link.to.nodeId)?.label ?? link.to.nodeId,
        portId: link.to.portId,
      },
      unit: descriptor?.form === "solid" ? "items/min" : "m³/min",
    } as const;
  });
  cache.set(document, presentations);
  return presentations;
}
