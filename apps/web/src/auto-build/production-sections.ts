import { createNode, findDescriptor } from "@satisfactory-belt/production";
import type {
  CanvasDocument,
  CanvasMaterialLink,
  CanvasNode,
} from "@/canvas/document";
import { prepareProductionInsertion } from "@/canvas/insert-production";
import {
  productionRequest,
  type AutoBuildSettings,
} from "./production-request";

export type ProductionSection = Readonly<{
  id: string;
  nodeIds: readonly string[];
  settings: AutoBuildSettings;
}>;

export function productionSectionName(section: ProductionSection) {
  return section.settings.outputs
    .map(
      (output) =>
        `${findDescriptor(output.itemId)?.name ?? output.itemId} · ${output.ratePerMinute}/min`,
    )
    .join(", ");
}

export function parseProductionSections(
  value: unknown,
): readonly ProductionSection[] {
  const record = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  const strings = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((s) => typeof s === "string" && s.length > 0);
  if (!Array.isArray(value)) throw new Error("Invalid production requests.");
  const sectionIds = new Set<string>();
  const nodeIds = new Set<string>();
  return value.map((entry) => {
    if (
      !record(entry) ||
      typeof entry.id !== "string" ||
      !entry.id ||
      sectionIds.has(entry.id) ||
      !strings(entry.nodeIds) ||
      !record(entry.settings)
    )
      throw new Error("Invalid production section.");
    sectionIds.add(entry.id);
    for (const id of entry.nodeIds) {
      if (nodeIds.has(id))
        throw new Error(
          "A node cannot belong to multiple production sections.",
        );
      nodeIds.add(id);
    }
    const s = entry.settings;
    if (
      !Array.isArray(s.outputs) ||
      !s.outputs.every(
        (o) =>
          record(o) &&
          typeof o.itemId === "string" &&
          typeof o.ratePerMinute === "number",
      ) ||
      !strings(s.allowedAlternateIds) ||
      !record(s.pinnedRecipes) ||
      !Object.values(s.pinnedRecipes).every((id) => typeof id === "string") ||
      (s.resourceNodes !== undefined &&
        (!Array.isArray(s.resourceNodes) ||
          !s.resourceNodes.every(
            (r) =>
              record(r) &&
              typeof r.itemId === "string" &&
              typeof r.buildableId === "string",
          )))
    )
      throw new Error("Invalid saved production settings.");
    const settings = s as unknown as AutoBuildSettings;
    productionRequest(settings);
    return {
      id: entry.id,
      nodeIds: entry.nodeIds,
      settings: structuredClone(settings),
    };
  });
}

export function attachProductionRequest(
  document: CanvasDocument,
  id: string,
  settings: AutoBuildSettings,
): CanvasDocument {
  return {
    ...document,
    productionSections: [
      {
        id,
        settings: structuredClone(settings),
        nodeIds: document.nodes.map((n) => n.configuration.id),
      },
    ],
  };
}

/** Replacement owns only its recorded members. New manual nodes stay outside.
 * Boundary ports are matched by machine/process and material, never generated
 * sequence IDs (which can change when recipes or outputs change). */
export function prepareProductionReplacement(
  source: CanvasDocument,
  section: ProductionSection,
  generated: CanvasDocument,
  settings: AutoBuildSettings,
) {
  const members = new Set(section.nodeIds);
  const oldNodes = source.nodes.filter((n) => members.has(n.configuration.id));
  if (!oldNodes.length)
    throw new Error("This production section no longer has any nodes.");
  const outside: CanvasDocument = {
    ...source,
    nodes: source.nodes.filter((n) => !members.has(n.configuration.id)),
    materialLinks: source.materialLinks.filter(
      (l) => !members.has(l.from.nodeId) && !members.has(l.to.nodeId),
    ),
  };
  const replacement = attachProductionRequest(
    prepareProductionInsertion(outside, generated, section.id, {
      x: Math.min(...oldNodes.map((n) => n.x)),
      y: Math.min(...oldNodes.map((n) => n.y)),
    }),
    section.id,
    settings,
  );
  const signature = (node: CanvasNode) => {
    const c = node.configuration;
    return JSON.stringify([
      c.kind,
      c.buildableId,
      c.kind === "process" ? c.processId : null,
      c.kind === "process"
        ? [
            ...new Set(
              c.instances.map((i) =>
                "resourcePurity" in i ? i.resourcePurity : null,
              ),
            ),
          ].sort((a, b) => String(a).localeCompare(String(b)))
        : null,
    ]);
  };
  const boundary = source.materialLinks.filter(
    (l) => members.has(l.from.nodeId) !== members.has(l.to.nodeId),
  );
  const retained: CanvasMaterialLink[] = [];
  const disconnected: CanvasMaterialLink[] = [];
  for (const link of boundary) {
    const end = members.has(link.from.nodeId) ? "from" : "to";
    const old = oldNodes.find((n) => n.configuration.id === link[end].nodeId)!;
    const port = createNode(old.configuration).ports.find(
      (p) => p.id === link[end].portId,
    );
    const matches = replacement.nodes
      .filter((n) => signature(n) === signature(old))
      .flatMap((n) =>
        createNode(n.configuration)
          .ports.filter(
            (p) =>
              port &&
              p.direction === port.direction &&
              p.itemId === port.itemId &&
              p.medium === port.medium,
          )
          .map((p) => ({ nodeId: n.configuration.id, portId: p.id })),
      );
    if (matches.length !== 1) {
      disconnected.push(link);
      continue;
    }
    const { route: _route, routeMode: _mode, ...base } = link;
    retained.push({ ...base, [end]: matches[0] });
  }
  // A user may have reconnected a formerly internal belt to an outside node.
  // Keep that belt's identity and give any colliding new internal link a free ID.
  const usedLinkIds = new Set(
    [...outside.materialLinks, ...retained].map((l) => l.id),
  );
  const internalLinks = replacement.materialLinks.map((link) => {
    let id = link.id;
    while (usedLinkIds.has(id)) id += ":replacement";
    usedLinkIds.add(id);
    return id === link.id ? link : { ...link, id };
  });
  const document: CanvasDocument = {
    ...source,
    nodes: [...outside.nodes, ...replacement.nodes],
    materialLinks: [...outside.materialLinks, ...internalLinks, ...retained],
    productionSections: source.productionSections!.map((s) =>
      s.id === section.id ? replacement.productionSections![0]! : s,
    ),
  };
  return {
    document,
    oldNodeCount: oldNodes.length,
    newNodeCount: replacement.nodes.length,
    retained,
    disconnected,
  };
}

export type ProductionReplacement = ReturnType<
  typeof prepareProductionReplacement
>;
