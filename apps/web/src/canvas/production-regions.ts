import { findProductionProcess } from "@satisfactory-belt/production";
import type { CanvasDocument, CanvasNode } from "./document";
import { productionStructure } from "./production-structure";
import { presentMaterialLinks } from "./material-link-presentation";
import { groupBounds } from "./group-bounds";

const cache = new WeakMap<CanvasDocument, ReturnType<typeof regions>>();
export function productionRegions(
  document: CanvasDocument,
  topology: "aggregate" | "physical" = "physical",
) {
  if (topology === "aggregate") return [];
  let result = cache.get(document);
  if (!result) {
    result = regions(document);
    cache.set(document, result);
  }
  return result;
}
function regions(document: CanvasDocument) {
  // Hand-placed cards need not form columns. Only annotate readable groups;
  // moving a card into another area never leaves a stale enclosing box behind.
  if (
    !document.materialLinks.length ||
    !document.materialLinks.some((link) => link.route)
  )
    return [];
  const recipes = new Map<string, CanvasNode[]>();
  for (const node of document.nodes)
    if (node.configuration.kind === "process") {
      const group = recipes.get(node.configuration.processId) ?? [];
      group.push(node);
      recipes.set(node.configuration.processId, group);
    }
  const structure = productionStructure(document);
  const links = presentMaterialLinks(document);
  const groups = [
    ...[...recipes.values()]
      .filter((nodes) => nodes.every((node) => node.x === nodes[0]!.x))
      .map((nodes) => ({
        id: JSON.stringify([
          "recipe",
          nodes[0]!.configuration.kind === "process"
            ? nodes[0]!.configuration.processId
            : nodes[0]!.configuration.id,
        ]),
        nodes,
        label: `${nodes[0]!.configuration.kind === "process" ? (findProductionProcess(nodes[0]!.configuration.processId)?.name ?? nodes[0]!.label) : nodes[0]!.label}`,
        logistics: false,
      })),
    ...structure.logistics.map((ids) => {
      const edge = document.materialLinks.find(
        (link) =>
          ids.includes(link.from.nodeId) || ids.includes(link.to.nodeId),
      );
      const item = links.find((link) => link.id === edge?.id)?.itemName;
      return {
        id: JSON.stringify(["logistics", ids[0]]),
        nodes: document.nodes.filter((node) =>
          ids.includes(node.configuration.id),
        ),
        label: item ? `${item} logistics` : "Logistics",
        logistics: true,
      };
    }),
  ];
  return groups.flatMap((group) => {
    const ids = new Set(group.nodes.map((node) => node.configuration.id));
    const internal = group.logistics
      ? document.materialLinks
          .filter(
            (link) => ids.has(link.from.nodeId) && ids.has(link.to.nodeId),
          )
          .map((link) => link.route ?? [])
      : [];
    const { x, y, width, height } = groupBounds(group.nodes, internal);
    if (
      document.nodes.some(
        (node) =>
          !group.nodes.includes(node) &&
          node.x < x + width &&
          node.x + node.width > x &&
          node.y < y + height &&
          node.y + node.height > y,
      )
    )
      return [];
    return [
      {
        x,
        y,
        width,
        height,
        id: group.id,
        nodeIds: group.nodes.map((node) => node.configuration.id),
        name: document.groupNames?.[group.id] ?? group.label,
        defaultName: group.label,
        count: group.nodes.length,
        logistics: group.logistics,
      },
    ];
  });
}
