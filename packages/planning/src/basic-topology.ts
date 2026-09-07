import {
  createNode,
  type MaterialPort,
  type Node,
  type NodeConfiguration,
} from "@satisfactory-belt/production";

import type {
  BasicMaterialNetwork,
  BasicNode,
  BasicPlan,
  BasicPlanAnalysis,
  MaterialEndpoint,
  MaterialLink,
  OperationalDiagnostic,
} from "./types";

export type BasicPlanErrorCode =
  | "basic.endpoint.direction"
  | "basic.endpoint.form"
  | "basic.endpoint.medium"
  | "basic.endpoint.missing"
  | "basic.endpoint.occupied"
  | "basic.link.descriptor-conflict"
  | "basic.link.duplicate-id"
  | "basic.link.empty-id"
  | "basic.link.self"
  | "basic.node.duplicate-id"
  | "basic.node.empty-id"
  | "basic.port.unsupported-medium";

export type MaterialConnectionTarget = Readonly<{
  endpoint: MaterialEndpoint;
  error?: Readonly<{ code: BasicPlanErrorCode; message: string }>;
  status: "compatible" | "invalid" | "occupied" | "source";
}>;

export class BasicPlanError extends Error {
  override readonly name = "BasicPlanError";

  constructor(
    readonly code: BasicPlanErrorCode,
    message: string,
    readonly context: Readonly<Record<string, string>> = {},
  ) {
    super(message);
  }
}

type ResolvedPort = Readonly<{
  node: Node;
  port: MaterialPort;
}>;

type BasicPlanRequest = Readonly<{
  materialLinks?: readonly MaterialLink[];
  nodes: readonly (BasicNode | NodeConfiguration)[];
}>;

const supportedMedia = new Set(["conveyor", "pipeline"]);

function nodeId(node: BasicNode) {
  return node.configuration.id;
}

function asBasicNode(node: BasicNode | NodeConfiguration): BasicNode {
  return "configuration" in node ? node : { configuration: node };
}

function portKey(endpoint: MaterialEndpoint) {
  return `${endpoint.nodeId}\u0000${endpoint.portId}`;
}

function compareEndpoint(left: MaterialEndpoint, right: MaterialEndpoint) {
  return (
    left.nodeId.localeCompare(right.nodeId) ||
    left.portId.localeCompare(right.portId)
  );
}

class DisjointSet {
  private readonly parent = new Map<string, string>();

  add(key: string) {
    if (!this.parent.has(key)) this.parent.set(key, key);
  }

  find(key: string): string {
    this.add(key);
    const parent = this.parent.get(key)!;
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].toSorted();
    this.parent.set(second!, first!);
  }

  keys() {
    return this.parent.keys();
  }
}

function resolveNodes(nodes: readonly BasicNode[]) {
  const resolved = new Map<string, Node>();
  for (const basicNode of nodes) {
    const id = nodeId(basicNode);
    if (!id.trim()) {
      throw new BasicPlanError("basic.node.empty-id", "Node id is required.");
    }
    if (resolved.has(id)) {
      throw new BasicPlanError(
        "basic.node.duplicate-id",
        `Node id ${id} is duplicated.`,
        { nodeId: id },
      );
    }
    resolved.set(id, createNode(basicNode.configuration));
  }
  return resolved;
}

function resolveEndpoint(
  nodes: ReadonlyMap<string, Node>,
  endpoint: MaterialEndpoint,
): ResolvedPort {
  const node = nodes.get(endpoint.nodeId);
  const port = node?.ports.find(({ id }) => id === endpoint.portId);
  if (!node || !port) {
    throw new BasicPlanError(
      "basic.endpoint.missing",
      `Material Port ${endpoint.nodeId}:${endpoint.portId} does not exist.`,
      { nodeId: endpoint.nodeId, portId: endpoint.portId },
    );
  }
  if (!supportedMedia.has(port.medium)) {
    throw new BasicPlanError(
      "basic.port.unsupported-medium",
      `Material Port ${endpoint.nodeId}:${endpoint.portId} uses unsupported medium ${port.medium}.`,
      { medium: port.medium, nodeId: endpoint.nodeId, portId: endpoint.portId },
    );
  }
  return { node, port };
}

function directionsCompatible(left: MaterialPort, right: MaterialPort) {
  return !(
    (left.direction === "input" && right.direction === "input") ||
    (left.direction === "output" && right.direction === "output")
  );
}

function canonicalLink(
  link: MaterialLink,
  from: ResolvedPort,
  to: ResolvedPort,
): MaterialLink {
  if (from.port.direction === "input" || to.port.direction === "output") {
    return { ...link, from: link.to, to: link.from };
  }
  if (
    from.port.direction === "bidirectional" &&
    to.port.direction === "bidirectional" &&
    compareEndpoint(link.to, link.from) < 0
  ) {
    return { ...link, from: link.to, to: link.from };
  }
  return link;
}

function validateLinks(
  links: readonly MaterialLink[],
  nodes: ReadonlyMap<string, Node>,
) {
  const ids = new Set<string>();
  const occupied = new Map<string, string>();
  const canonical: MaterialLink[] = [];

  for (const link of links) {
    if (!link.id.trim()) {
      throw new BasicPlanError(
        "basic.link.empty-id",
        "Material Link id is required.",
      );
    }
    if (ids.has(link.id)) {
      throw new BasicPlanError(
        "basic.link.duplicate-id",
        `Material Link id ${link.id} is duplicated.`,
        { linkId: link.id },
      );
    }
    ids.add(link.id);
    if (link.from.nodeId === link.to.nodeId) {
      throw new BasicPlanError(
        "basic.link.self",
        "A Material Link cannot connect a Node to itself.",
        { linkId: link.id, nodeId: link.from.nodeId },
      );
    }

    const from = resolveEndpoint(nodes, link.from);
    const to = resolveEndpoint(nodes, link.to);
    for (const endpoint of [link.from, link.to]) {
      const key = portKey(endpoint);
      const existingLinkId = occupied.get(key);
      if (existingLinkId) {
        throw new BasicPlanError(
          "basic.endpoint.occupied",
          `Material Port ${endpoint.nodeId}:${endpoint.portId} is already occupied.`,
          {
            existingLinkId,
            linkId: link.id,
            nodeId: endpoint.nodeId,
            portId: endpoint.portId,
          },
        );
      }
      occupied.set(key, link.id);
    }
    if (!directionsCompatible(from.port, to.port)) {
      throw new BasicPlanError(
        "basic.endpoint.direction",
        "Material Link endpoint directions are incompatible.",
        { linkId: link.id },
      );
    }
    if (from.port.medium !== to.port.medium) {
      throw new BasicPlanError(
        "basic.endpoint.medium",
        "Material Link endpoint media do not match.",
        {
          fromMedium: from.port.medium,
          linkId: link.id,
          toMedium: to.port.medium,
        },
      );
    }
    if (!from.port.forms.some((form) => to.port.forms.includes(form))) {
      throw new BasicPlanError(
        "basic.endpoint.form",
        "Material Link endpoint material forms do not overlap.",
        { linkId: link.id },
      );
    }
    if (
      from.port.itemId &&
      to.port.itemId &&
      from.port.itemId !== to.port.itemId
    ) {
      throw new BasicPlanError(
        "basic.link.descriptor-conflict",
        "Material Link endpoint Descriptors conflict.",
        {
          fromItemId: from.port.itemId,
          linkId: link.id,
          toItemId: to.port.itemId,
        },
      );
    }
    canonical.push(canonicalLink(link, from, to));
  }
  return canonical;
}

function connectedNetworks(
  plan: BasicPlan,
  nodes: ReadonlyMap<string, Node>,
): readonly BasicMaterialNetwork[] {
  const sets = new DisjointSet();
  const portItemIds = new Map<string, string>();
  const linkByPort = new Map<string, string[]>();

  for (const node of nodes.values()) {
    const supportedPorts = node.ports.filter(
      (port) => supportedMedia.has(port.medium) && port.purpose !== "fuel",
    );
    for (const port of supportedPorts) {
      const key = portKey({ nodeId: node.configuration.id, portId: port.id });
      sets.add(key);
      if (port.itemId) portItemIds.set(key, port.itemId);
    }
    if (
      node.kind === "router" ||
      node.kind === "buffer" ||
      node.kind === "transport"
    ) {
      for (const medium of supportedMedia) {
        const keys = supportedPorts
          .filter((port) => port.medium === medium)
          .map((port) =>
            portKey({ nodeId: node.configuration.id, portId: port.id }),
          );
        for (const key of keys.slice(1)) sets.union(keys[0]!, key);
      }
    }
  }

  for (const link of plan.materialLinks) {
    const fromKey = portKey(link.from);
    const toKey = portKey(link.to);
    sets.union(fromKey, toKey);
    for (const key of [fromKey, toKey]) {
      const linkIds = linkByPort.get(key) ?? [];
      linkIds.push(link.id);
      linkByPort.set(key, linkIds);
    }
  }

  const groups = new Map<string, string[]>();
  for (const key of sets.keys()) {
    const root = sets.find(key);
    const keys = groups.get(root) ?? [];
    keys.push(key);
    groups.set(root, keys);
  }

  return [...groups.values()]
    .map((keys) => {
      const itemIds = [
        ...new Set(keys.flatMap((key) => portItemIds.get(key) ?? [])),
      ].toSorted();
      if (itemIds.length > 1) {
        throw new BasicPlanError(
          "basic.link.descriptor-conflict",
          `Connected Material Ports bind conflicting Descriptors ${itemIds.join(", ")}.`,
          { itemIds: itemIds.join(",") },
        );
      }
      return {
        ...(itemIds[0] ? { itemId: itemIds[0] } : {}),
        linkIds: [
          ...new Set(keys.flatMap((key) => linkByPort.get(key) ?? [])),
        ].toSorted(),
        portKeys: keys.toSorted(),
      };
    })
    .filter(({ linkIds }) => linkIds.length > 0)
    .toSorted((left, right) =>
      left.portKeys[0]!.localeCompare(right.portKeys[0]!),
    );
}

export function createBasicPlan(request: BasicPlanRequest): BasicPlan {
  const nodes = request.nodes.map(asBasicNode);
  const resolved = resolveNodes(nodes);
  const materialLinks = validateLinks(request.materialLinks ?? [], resolved);
  const plan: BasicPlan = { kind: "basic", materialLinks, nodes, version: 1 };
  connectedNetworks(plan, resolved);
  return plan;
}

export function connectMaterialPorts(
  plan: BasicPlan,
  endpoints: Readonly<{
    from: MaterialEndpoint;
    id: string;
    to: MaterialEndpoint;
  }>,
): BasicPlan {
  return createBasicPlan({
    materialLinks: [...plan.materialLinks, endpoints],
    nodes: plan.nodes,
  });
}

export function disconnectMaterialLink(
  plan: BasicPlan,
  linkId: string,
): BasicPlan {
  return createBasicPlan({
    materialLinks: plan.materialLinks.filter(({ id }) => id !== linkId),
    nodes: plan.nodes,
  });
}

/** Classifies every Material Port against the same rules as a committed link. */
export function inspectMaterialConnectionTargets(
  plan: BasicPlan,
  source: MaterialEndpoint,
): readonly MaterialConnectionTarget[] {
  const validated = createBasicPlan(plan);
  const nodes = resolveNodes(validated.nodes);
  const sourceResolved = resolveEndpoint(nodes, source);
  const occupied = new Map<string, string>();
  for (const link of validated.materialLinks) {
    occupied.set(portKey(link.from), link.id);
    occupied.set(portKey(link.to), link.id);
  }
  const itemByPort = new Map<string, string>();
  for (const network of connectedNetworks(validated, nodes)) {
    if (!network.itemId) continue;
    for (const key of network.portKeys) itemByPort.set(key, network.itemId);
  }
  for (const node of nodes.values()) {
    for (const port of node.ports) {
      if (port.itemId) {
        itemByPort.set(
          portKey({ nodeId: node.configuration.id, portId: port.id }),
          port.itemId,
        );
      }
    }
  }

  const sourceKey = portKey(source);
  const sourceItemId = itemByPort.get(sourceKey);
  const invalid = (
    endpoint: MaterialEndpoint,
    code: BasicPlanErrorCode,
    message: string,
    status: MaterialConnectionTarget["status"] = "invalid",
  ): MaterialConnectionTarget => ({
    endpoint,
    error: { code, message },
    status,
  });

  return [...nodes.values()].flatMap((node) =>
    node.ports.map((port) => {
      const endpoint = { nodeId: node.configuration.id, portId: port.id };
      const key = portKey(endpoint);
      if (key === sourceKey) return { endpoint, status: "source" } as const;
      if (occupied.has(sourceKey)) {
        return invalid(
          endpoint,
          "basic.endpoint.occupied",
          "The source Material Port is already connected.",
          "occupied",
        );
      }
      if (occupied.has(key)) {
        return invalid(
          endpoint,
          "basic.endpoint.occupied",
          "This Material Port is already connected.",
          "occupied",
        );
      }
      if (endpoint.nodeId === source.nodeId) {
        return invalid(
          endpoint,
          "basic.link.self",
          "A Material Link cannot connect a Node to itself.",
        );
      }
      if (
        !supportedMedia.has(sourceResolved.port.medium) ||
        !supportedMedia.has(port.medium) ||
        sourceResolved.port.purpose === "fuel" ||
        port.purpose === "fuel"
      ) {
        return invalid(
          endpoint,
          "basic.port.unsupported-medium",
          "This Material Port cannot carry a Material Link.",
        );
      }
      if (!directionsCompatible(sourceResolved.port, port)) {
        return invalid(
          endpoint,
          "basic.endpoint.direction",
          "Connect an output to an input.",
        );
      }
      if (sourceResolved.port.medium !== port.medium) {
        return invalid(
          endpoint,
          "basic.endpoint.medium",
          "Conveyor and Pipeline Material Ports cannot be mixed.",
        );
      }
      if (
        !sourceResolved.port.forms.some((form) => port.forms.includes(form))
      ) {
        return invalid(
          endpoint,
          "basic.endpoint.form",
          "These Material Ports carry incompatible material forms.",
        );
      }
      const targetItemId = itemByPort.get(key);
      if (sourceItemId && targetItemId && sourceItemId !== targetItemId) {
        return invalid(
          endpoint,
          "basic.link.descriptor-conflict",
          "These Material Ports carry different materials.",
        );
      }
      return { endpoint, status: "compatible" } as const;
    }),
  );
}

export function analyzeBasicPlan(plan: BasicPlan): BasicPlanAnalysis {
  const validated = createBasicPlan(plan);
  const nodes = resolveNodes(validated.nodes);
  const networks = connectedNetworks(validated, nodes);
  const linkItemIds: Record<string, string | undefined> = {};
  for (const network of networks) {
    for (const linkId of network.linkIds) linkItemIds[linkId] = network.itemId;
  }
  const connectedPorts = new Set(
    validated.materialLinks.flatMap(({ from, to }) => [
      portKey(from),
      portKey(to),
    ]),
  );
  const diagnostics: OperationalDiagnostic[] = [];
  for (const node of nodes.values()) {
    if (node.kind !== "process") continue;
    for (const port of node.ports) {
      if (
        port.purpose === "fuel" ||
        connectedPorts.has(
          portKey({ nodeId: node.configuration.id, portId: port.id }),
        )
      ) {
        continue;
      }
      const input = port.direction === "input";
      diagnostics.push({
        code: input ? "basic.input.unconnected" : "basic.output.unconnected",
        itemId: port.itemId,
        message: input
          ? "Required input is not connected."
          : "Produced output is not connected.",
        nodeId: node.configuration.id,
        severity: input ? "warning" : "info",
      });
    }
  }
  return {
    diagnostics,
    linkItemIds,
    networks,
  };
}
