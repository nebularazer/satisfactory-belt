import type { CanvasDocument } from "./document";

const compare = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true });
const cache = new WeakMap<
  CanvasDocument,
  ReturnType<typeof analyzeStructure>
>();

/** Topology only: moving a card or changing belt capacity cannot change its role. */
export function productionStructure(document: CanvasDocument) {
  let structure = cache.get(document);
  if (!structure) {
    structure = analyzeStructure(document);
    cache.set(document, structure);
  }
  return structure;
}

function analyzeStructure(document: CanvasDocument) {
  const nodes = document.nodes.toSorted((a, b) =>
    compare(a.configuration.id, b.configuration.id),
  );
  const links = document.materialLinks.toSorted((a, b) => compare(a.id, b.id));
  const outgoing = new Map(
    nodes.map((node) => [
      node.configuration.id,
      links.filter((link) => link.from.nodeId === node.configuration.id),
    ]),
  );
  const incoming = new Map(
    nodes.map((node) => [
      node.configuration.id,
      links.filter((link) => link.to.nodeId === node.configuration.id),
    ]),
  );
  // Tarjan components identify actual cycles, so an ordinary long bypass is
  // never mistaken for a return belt merely because it travels to the left.
  let next = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const components: string[][] = [];
  function visit(id: string) {
    index.set(id, next);
    low.set(id, next++);
    stack.push(id);
    active.add(id);
    for (const link of outgoing.get(id) ?? []) {
      const target = link.to.nodeId;
      if (!index.has(target)) {
        visit(target);
        low.set(id, Math.min(low.get(id)!, low.get(target)!));
      } else if (active.has(target))
        low.set(id, Math.min(low.get(id)!, index.get(target)!));
    }
    if (low.get(id) === index.get(id)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        active.delete(member);
        component.push(member);
      } while (member !== id);
      components.push(component.sort(compare));
    }
  }
  for (const node of nodes)
    if (!index.has(node.configuration.id)) visit(node.configuration.id);
  const feedbackLinks = new Set<string>();
  const entries = new Set<string>();
  for (const component of components) {
    const members = new Set(component);
    const roots = component.filter((id) =>
      incoming.get(id)?.some((link) => !members.has(link.from.nodeId)),
    );
    if (!roots.length) roots.push(component[0]!);
    roots.forEach((id) => entries.add(id));
    const depth = new Map(roots.map((id) => [id, 0]));
    const queue = [...roots];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      for (const link of outgoing.get(id) ?? []) {
        const target = link.to.nodeId;
        if (members.has(target) && !depth.has(target)) {
          depth.set(target, depth.get(id)! + 1);
          queue.push(target);
        }
      }
    }
    for (const id of component)
      for (const link of outgoing.get(id) ?? []) {
        const target = link.to.nodeId;
        if (
          members.has(target) &&
          (depth.get(target)! < depth.get(id)! ||
            (depth.get(target) === depth.get(id) && compare(target, id) <= 0))
        )
          feedbackLinks.add(link.id);
      }
  }
  const routers = new Set(
    nodes
      .filter((node) => node.configuration.kind === "router")
      .map((node) => node.configuration.id),
  );
  // A return distributor can also feed parallel branches outside its own
  // strongly connected component. Recognize those rejoins by supply depth.
  const supplyDepth = new Map<string, number>();
  const supplyQueue = [...routers].filter(
    (id) =>
      incoming.get(id)!.some((link) => !routers.has(link.from.nodeId)) ||
      !incoming.get(id)!.length,
  );
  supplyQueue.forEach((id) => supplyDepth.set(id, 0));
  for (let i = 0; i < supplyQueue.length; i++) {
    const id = supplyQueue[i]!;
    for (const link of outgoing.get(id)!) {
      const target = link.to.nodeId;
      if (routers.has(target) && !supplyDepth.has(target)) {
        supplyDepth.set(target, supplyDepth.get(id)! + 1);
        supplyQueue.push(target);
      }
    }
  }
  for (const id of routers) {
    const outputs = outgoing.get(id)!;
    if (!outputs.some((link) => feedbackLinks.has(link.id))) continue;
    for (const link of outputs) {
      if (
        routers.has(link.to.nodeId) &&
        supplyDepth.has(id) &&
        supplyDepth.has(link.to.nodeId) &&
        supplyDepth.get(link.to.nodeId)! < supplyDepth.get(id)!
      )
        feedbackLinks.add(link.id);
    }
  }
  // A router serving only return feeds belongs to the return lane too. Include
  // its incoming belt in the dashed path; never absorb a fresh-supply entry.
  const returnNodes = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      const id = node.configuration.id;
      const outputs = outgoing.get(id)!;
      if (
        node.configuration.kind !== "router" ||
        entries.has(id) ||
        returnNodes.has(id) ||
        !outputs.length ||
        outputs.some((link) => !routers.has(link.to.nodeId)) ||
        incoming.get(id)!.some((link) => !routers.has(link.from.nodeId)) ||
        !outputs.every((link) => feedbackLinks.has(link.id))
      )
        continue;
      returnNodes.add(id);
      for (const link of incoming.get(id)!) feedbackLinks.add(link.id);
      changed = true;
    }
  }
  const configurations = new Map(
    nodes.map((node) => [node.configuration.id, node.configuration]),
  );
  // Ownership stops at the next production recipe. Propagating destinations
  // through routers keeps cycles intact without absorbing later factory stages.
  const destinations = new Map(
    [...routers].map((id) => [id, new Set<string>()]),
  );
  for (const link of links) {
    const target = configurations.get(link.to.nodeId);
    if (routers.has(link.from.nodeId) && target?.kind === "process")
      destinations
        .get(link.from.nodeId)!
        .add(JSON.stringify([target.processId, link.to.portId]));
  }
  changed = true;
  while (changed) {
    changed = false;
    const inherit = (from: string, to: string) => {
      for (const destination of destinations.get(to)!) {
        const owned = destinations.get(from)!;
        if (!owned.has(destination)) {
          owned.add(destination);
          changed = true;
        }
      }
    };
    for (const link of links) {
      if (!routers.has(link.from.nodeId) || !routers.has(link.to.nodeId))
        continue;
      inherit(link.from.nodeId, link.to.nodeId);
      // Return distributors can rejoin parallel branches outside their cycle.
      // Keep those complete feedback paths in the same ownership area too.
      if (feedbackLinks.has(link.id)) inherit(link.to.nodeId, link.from.nodeId);
    }
  }
  const ownership = new Map(
    [...destinations].map(([id, targets]) => [
      id,
      JSON.stringify([...targets].sort(compare)),
    ]),
  );
  const adjacent = new Map([...routers].map((id) => [id, new Set<string>()]));
  const join = (a: string, b: string) => {
    if (ownership.get(a) !== ownership.get(b)) return;
    adjacent.get(a)!.add(b);
    adjacent.get(b)!.add(a);
  };
  const recipePorts = new Map<string, string[]>();
  for (const link of links) {
    if (routers.has(link.from.nodeId) && routers.has(link.to.nodeId))
      join(link.from.nodeId, link.to.nodeId);
    for (const [endpoint, router] of [
      [link.from, link.to.nodeId],
      [link.to, link.from.nodeId],
    ] as const) {
      const machine = configurations.get(endpoint.nodeId);
      if (machine?.kind !== "process" || !routers.has(router)) continue;
      // Parallel supplies can share a group only when they have the same
      // downstream purpose. Sharing an ingot producer alone is insufficient.
      const key = JSON.stringify([
        machine.processId,
        endpoint.portId,
        ownership.get(router),
      ]);
      const siblings = recipePorts.get(key) ?? [];
      siblings.push(router);
      recipePorts.set(key, siblings);
    }
  }
  for (const siblings of recipePorts.values())
    for (const id of siblings.slice(1)) join(siblings[0]!, id);
  const logistics: string[][] = [];
  for (const root of routers) {
    if (logistics.some((group) => group.includes(root))) continue;
    const group = new Set([root]);
    const queue = [root];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      for (const other of adjacent.get(id)!) {
        if (!group.has(other)) {
          group.add(other);
          queue.push(other);
        }
      }
    }
    logistics.push([...group].sort(compare));
  }
  // A group describes the main balancing task, not exclusive ownership of
  // every output. Keep the host's identity/name when it adopts a shared router.
  const groupDestinations = new Map(
    logistics.map((ids) => [
      ids,
      [
        ...new Set(
          [...destinations.get(ids[0]!)!].map(
            (target) => (JSON.parse(target) as [string, string])[0],
          ),
        ),
      ].sort(compare),
    ]),
  );
  absorbSingletons(logistics, links);
  const logisticsDestinations = new Map(
    logistics.map((ids) => [ids[0]!, groupDestinations.get(ids)!]),
  );
  return { feedbackLinks, returnNodes, logistics, logisticsDestinations };
}

/** Fold a lone router into one connected larger area. Other branches remain
 * ordinary inter-group links; never merge their destination groups together. */
function absorbSingletons(
  groups: string[][],
  links: CanvasDocument["materialLinks"],
) {
  const owner = new Map(
    groups.flatMap((group) => group.map((id) => [id, group] as const)),
  );
  let absorbed = true;
  while (absorbed) {
    absorbed = false;
    for (const single of groups.filter((group) => group.length === 1)) {
      const adjacent = new Map(
        groups.map((group) => [group, new Set<string[]>()]),
      );
      const connections = new Map<string[], number>();
      for (const link of links) {
        const from = owner.get(link.from.nodeId),
          to = owner.get(link.to.nodeId);
        if (!from || !to || from === to) continue;
        adjacent.get(from)!.add(to);
        const neighbor =
          from === single ? to : to === single ? from : undefined;
        if (neighbor && neighbor.length > 1)
          connections.set(neighbor, (connections.get(neighbor) ?? 0) + 1);
      }
      // Contracting a direct edge must not turn an alternate forward path into
      // a cycle between group boxes. Feedback is already enclosed before this pass.
      const hasIndirectPath = (from: string[], to: string[]) => {
        const visited = new Set([from]);
        const queue = [...adjacent.get(from)!].filter((next) => next !== to);
        for (let i = 0; i < queue.length; i++) {
          const next = queue[i]!;
          if (next === to) return true;
          if (visited.has(next)) continue;
          visited.add(next);
          queue.push(...adjacent.get(next)!);
        }
        return false;
      };
      const host = [...connections.keys()]
        .filter(
          (group) =>
            !hasIndirectPath(single, group) && !hasIndirectPath(group, single),
        )
        .sort(
          (a, b) =>
            connections.get(b)! - connections.get(a)! ||
            b.length - a.length ||
            compare(a[0]!, b[0]!),
        )[0];
      if (!host) continue;
      owner.set(single[0]!, host);
      // Preserve the original host anchor for saved custom group names.
      host.push(single[0]!);
      const [anchor, ...rest] = host;
      host.splice(0, host.length, anchor!, ...rest.sort(compare));
      groups.splice(groups.indexOf(single), 1);
      absorbed = true;
    }
  }
}
