import {
  CanvasController,
  GRID_SIZE,
  snapToGrid,
  routeLink,
  translateGuides,
} from "@satisfactory-belt/canvas-core";
import type { CanvasLink, Point, PortReference, RouteGuide } from "@satisfactory-belt/canvas-core";
import { EditHistory } from "@satisfactory-belt/edit-history";
import {
  remapCopiedFacilities,
  reconcileTransportConnections,
  isMaterialTransport,
  copiedTransportRoutes,
  validateTransportRoute,
  validateFacilityReferences,
  createConfigurationValidator,
  setMatrixSupply,
  createConnectionIndex,
  createFactoryNode,
  firstPlacementConnection,
  PIPE_PORT_RADIUS,
  PORT_RADIUS,
  nodeBounds,
  resolveFactoryNode,
  setMachineSetting,
  resizeMachineGroup,
  resolveSemanticPorts,
} from "@satisfactory-belt/factory-core";
import type {
  TransportRoute,
  DepotResearch,
  FactoryNode,
  MachineScope,
  MachineSetting,
  NodeConfiguration,
  NodeDisplay,
  SemanticPort,
  FactoryDocument,
  MaterialLink,
  SplitterProgram,
} from "@satisfactory-belt/factory-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";

/** The host owns document edits and the workspace-local clipboard. */
export function createFactoryEditor(catalog: GameCatalog, initialDocument: FactoryDocument) {
  const history = new EditHistory<FactoryDocument>(reconcileTransportConnections(initialDocument));
  let semanticPorts: SemanticPort[] = [];
  let publishedLinks: readonly MaterialLink[] | null = null;
  let routed = new Map<string, CanvasLink>();
  let displays = new Map<string, NodeDisplay>();
  let previousNodes = new Map<string, FactoryNode>();
  let portIndex = createConnectionIndex([], []);
  let publishedIndex: typeof portIndex | null = null;
  function project(nodes: readonly FactoryNode[]) {
    let configurationChanged = nodes.length !== previousNodes.size;
    const nextDisplays = new Map<string, NodeDisplay>();
    for (const node of nodes) {
      const previous = previousNodes.get(node.id);
      // Movement changes document positions, not card content.
      const unchanged = previous && sameConfiguration(previous, node);
      if (!unchanged) configurationChanged = true;
      nextDisplays.set(
        node.id,
        unchanged ? displays.get(node.id)! : resolveFactoryNode(node, catalog),
      );
    }
    displays = nextDisplays;
    if (configurationChanged) {
      const ports = nodes.flatMap((node) =>
        resolveSemanticPorts(node, catalog, displays.get(node.id)),
      );
      semanticPorts = ports;
      portIndex = createConnectionIndex(ports, history.getSnapshot().state.links);
    }
    previousNodes = new Map(nodes.map((node) => [node.id, node]));
    return nodes.map(nodeBounds);
  }
  const items = project(history.getSnapshot().state.nodes);
  function connect(a: PortReference, b: PortReference) {
    const result = portIndex.compatibility(a, b);
    if (result.compatible)
      history.update((current) =>
        reconcileTransportConnections({
          ...current,
          links: [
            ...current.links,
            {
              id: crypto.randomUUID(),
              output: { nodeId: result.output.nodeId, portKey: result.output.portKey },
              input: { nodeId: result.input.nodeId, portKey: result.input.portKey },
            },
          ],
        }),
      );
    return result;
  }
  function setRoute(id: string, guides?: readonly RouteGuide[]) {
    history.update((current) => {
      const link = current.links.find((entry) => entry.id === id);
      if (!link || JSON.stringify(link.guides) === JSON.stringify(guides)) return current;
      return {
        ...current,
        links: current.links.map((entry) => (entry.id === id ? { ...entry, guides } : entry)),
      };
    });
  }
  const controller = new CanvasController({
    items,
    onConnect: connect,
    onRoute: setRoute,
    onMove(moves, context) {
      const positions = new Map(moves.map((move) => [move.id, move]));
      history.update((current) => {
        let changed = false;
        const next = current.nodes.map((item) => {
          const position = positions.get(item.id);
          if (!position || (position.x === item.x && position.y === item.y)) return item;
          changed = true;
          return { ...item, x: position.x, y: position.y };
        });
        if (!changed) return current;
        const links = current.links.map((link) => {
          const a = positions.get(link.output.nodeId),
            b = positions.get(link.input.nodeId);
          const beforeA = previousNodes.get(link.output.nodeId),
            beforeB = previousNodes.get(link.input.nodeId);
          if (!link.guides || !a || !b || !beforeA || !beforeB) return link;
          const dx = a.x - beforeA.x,
            dy = a.y - beforeA.y;
          return dx === b.x - beforeB.x && dy === b.y - beforeB.y
            ? { ...link, guides: translateGuides(link.guides, { x: dx, y: dy }) }
            : link;
        });
        return {
          ...current,
          nodes: next,
          links: links.every((link, index) => link === current.links[index])
            ? current.links
            : links,
        };
      }, context?.group);
    },
  });
  function publishPorts() {
    const links = history.getSnapshot().state.links;
    if (
      !publishedLinks ||
      publishedLinks.length !== links.length ||
      links.some(
        (link, index) =>
          link.output !== publishedLinks![index]!.output ||
          link.input !== publishedLinks![index]!.input,
      )
    )
      portIndex = createConnectionIndex(semanticPorts, links);
    publishedLinks = links;
    if (publishedIndex === portIndex) return;
    publishedIndex = portIndex;
    controller.setPorts(
      [...displays].flatMap(([nodeId, display]) =>
        display.ports.map((port) => ({
          nodeId,
          portKey: port.key,
          direction: port.direction,
          x: port.x,
          y: port.y,
          radius: port.transport === "pipe" ? PIPE_PORT_RADIUS : PORT_RADIUS,
        })),
      ),
      portIndex.compatibility,
      portIndex.targets,
    );
  }
  function publishRoutes() {
    const { nodes, links } = history.getSnapshot().state;
    const bounds = new Map(nodes.map((node) => [node.id, nodeBounds(node)]));
    const point = (ref: PortReference) => {
      const box = bounds.get(ref.nodeId),
        port = displays.get(ref.nodeId)?.ports.find((p) => p.key === ref.portKey);
      return box && port ? { x: box.x + port.x, y: box.y + port.y } : null;
    };
    const next = new Map<string, CanvasLink>();
    for (const link of links) {
      const source = point(link.output),
        target = point(link.input);
      if (!source || !target) continue;
      const cached = routed.get(link.id),
        first = cached?.points[0],
        last = cached?.points.at(-1);
      const dirty =
        !cached ||
        cached.guides !== link.guides ||
        first?.x !== source.x ||
        first.y !== source.y ||
        last?.x !== target.x ||
        last.y !== target.y;
      next.set(
        link.id,
        dirty
          ? {
              ...link,
              points: routeLink(source, target, [], link.guides),
            }
          : cached,
      );
    }
    routed = next;
    controller.setLinks([...routed.values()]);
  }
  publishPorts();
  publishRoutes();
  history.subscribe(() => {
    const nextItems = project(history.getSnapshot().state.nodes);
    publishPorts();
    publishRoutes();
    controller.setItems(nextItems);
  });
  function historyCommand(command: "undo" | "redo") {
    controller.cancel();
    const before = history.getSnapshot().state.nodes;
    history[command]();
    const after = history.getSnapshot().state.nodes;
    if (command === "undo" && after.length > before.length) {
      // Undoing a deletion selects the restored items; movement keeps its selection.
      const previousIds = new Set(before.map((item) => item.id));
      const restored = after.filter((item) => !previousIds.has(item.id));
      if (restored.length) controller.setSelection(new Set(restored.map((item) => item.id)));
    }
  }

  function deleteSelection() {
    const { selection, interaction, linkSelection } = controller.getSnapshot();
    if (interaction !== "idle" || (!selection.size && !linkSelection.selected)) return;
    history.update((current) => {
      const nodes = current.nodes.filter((item) => !selection.has(item.id));
      const links = current.links.filter(
        (link) =>
          link.id !== linkSelection.selected &&
          !selection.has(link.output.nodeId) &&
          !selection.has(link.input.nodeId),
      );
      return nodes.length === current.nodes.length && links.length === current.links.length
        ? current
        : reconcileTransportConnections({
            ...current,
            nodes,
            links,
            routes: current.routes?.map((route) => ({
              ...route,
              stops: route.stops.filter((stop) => !selection.has(stop.nodeId)),
            })),
          });
    });
  }

  let clipboard: FactoryDocument = { nodes: [], links: [] };
  let pasteCount = 0;
  function clipboardCommand(command: "copy" | "paste") {
    const { selection, interaction, gridSnapping } = controller.getSnapshot();
    if (interaction !== "idle") return;
    if (command === "copy") {
      const selected = history.getSnapshot().state.nodes.filter((item) => selection.has(item.id));
      if (!selected.length) return;
      // Document items are immutable, so later edits cannot change this snapshot.
      clipboard = {
        nodes: selected,
        routes: copiedTransportRoutes(history.getSnapshot().state, selection),
        links: history
          .getSnapshot()
          .state.links.filter(
            (link) => selection.has(link.output.nodeId) && selection.has(link.input.nodeId),
          ),
      };
      pasteCount = 0;
      return;
    }
    if (!clipboard.nodes.length) return;
    const copiedNodes = clipboard.nodes.filter(
      (node) =>
        node.kind !== "facility" ||
        !isExistingElevator({ kind: "facility", buildingId: node.buildingId }),
    );
    if (!copiedNodes.length) return;
    const offset = (pasteCount + 1) * GRID_SIZE;
    const origin = clipboard.nodes.reduce(
      (point, item) => ({ x: Math.min(point.x, item.x), y: Math.min(point.y, item.y) }),
      { x: Infinity, y: Infinity },
    );
    // Snap the group's origin with one shared offset to retain its internal spacing.
    const dx = gridSnapping ? snapToGrid(origin.x + offset) - origin.x : offset;
    const dy = gridSnapping ? snapToGrid(origin.y + offset) - origin.y : offset;
    // oxlint-disable-next-line oxc/no-map-spread -- History and clipboard snapshots must stay immutable.
    let pasted: FactoryNode[] = copiedNodes.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      x: item.x + dx,
      y: item.y + dy,
    }));
    const ids = new Map(copiedNodes.map((node, index) => [node.id, pasted[index]!.id]));
    const remapped = remapCopiedFacilities(
      pasted,
      clipboard.routes ?? [],
      ids,
      new Set(history.getSnapshot().state.nodes.map((node) => node.id)),
      () => crypto.randomUUID(),
    );
    pasted = [...remapped.nodes];
    const links = clipboard.links
      .filter((link) => ids.has(link.output.nodeId) && ids.has(link.input.nodeId))
      // oxlint-disable-next-line oxc/no-map-spread -- Clipboard links and endpoint references are immutable.
      .map((link) => ({
        ...link,
        id: crypto.randomUUID(),
        output: { ...link.output, nodeId: ids.get(link.output.nodeId)! },
        input: { ...link.input, nodeId: ids.get(link.input.nodeId)! },
        guides: translateGuides(link.guides, { x: dx, y: dy }),
      }));
    history.update((current) =>
      reconcileTransportConnections({
        ...current,
        nodes: [...current.nodes, ...pasted],
        ...(remapped.routes.length
          ? { routes: [...(current.routes ?? []), ...remapped.routes] }
          : {}),
        links: [...current.links, ...links],
      }),
    );
    pasteCount++;
    controller.setSelection(new Set(pasted.map((item) => item.id)));
  }

  function updateNodes(transform: (nodes: readonly FactoryNode[]) => readonly FactoryNode[]) {
    history.update((current) => {
      const nodes = transform(current.nodes);
      if (nodes === current.nodes) return current;
      const ports = nodes.flatMap((node) => resolveSemanticPorts(node, catalog));
      const links: MaterialLink[] = [];
      for (const link of current.links)
        if (createConnectionIndex(ports, links).compatibility(link.output, link.input).compatible)
          links.push(link);
      return reconcileTransportConnections({
        ...current,
        nodes,
        links,
      });
    });
  }
  function editMachine(
    id: string,
    change: (node: Exclude<FactoryNode, { kind: "logistics" }>) => FactoryNode,
  ) {
    if (controller.getSnapshot().interaction !== "idle") return;
    history.update((current) => {
      const node = current.nodes.find((entry) => entry.id === id);
      if (!node || node.kind === "logistics") return current;
      const next = change(node);
      if (next === node) return current;
      // Validate before publishing to history or notifying canvas subscribers.
      resolveFactoryNode(next, catalog);
      return { ...current, nodes: current.nodes.map((entry) => (entry === node ? next : entry)) };
    });
  }
  function setOperatingSetting(
    id: string,
    scope: MachineScope,
    setting: MachineSetting,
    value: number,
  ) {
    editMachine(id, (node) => setMachineSetting(node, catalog, scope, setting, value));
  }
  function setMachineCount(id: string, count: number) {
    editMachine(id, (node) => resizeMachineGroup(node, count, () => crypto.randomUUID()));
  }
  function setSplitterProgram(id: string, program: SplitterProgram) {
    const node = history.getSnapshot().state.nodes.find((entry) => entry.id === id);
    if (!node || node.kind !== "logistics") throw new Error(`Missing splitter ${id}.`);
    if (JSON.stringify(node.program) === JSON.stringify(program)) return;
    const copied = structuredClone(program);
    updateNodes((nodes) =>
      nodes.map((entry) => (entry.id === id ? { ...node, program: copied } : entry)),
    );
  }
  function isExistingElevator(configuration: NodeConfiguration) {
    return (
      configuration.kind === "facility" &&
      catalog.buildings?.[configuration.buildingId]?.kind === "space-elevator" &&
      history
        .getSnapshot()
        .state.nodes.some(
          (node) => node.kind === "facility" && node.configuration.type === "space-elevator",
        )
    );
  }
  function canPlace(configuration: NodeConfiguration, source?: PortReference) {
    if (isExistingElevator(configuration)) return false;
    const id = crypto.randomUUID();
    const node = createFactoryNode(catalog, configuration, id, { x: 0, y: 0 });
    return (
      !source ||
      Boolean(
        firstPlacementConnection(
          catalog,
          semanticPorts,
          history.getSnapshot().state.links,
          source,
          node,
        ),
      )
    );
  }

  function placeNode(configuration: NodeConfiguration, center: Point, source?: PortReference) {
    if (isExistingElevator(configuration))
      throw new Error("A plan can contain only one Space Elevator.");
    let node = createFactoryNode(catalog, configuration, crypto.randomUUID(), center);
    const bounds = nodeBounds(node);
    const snap = controller.getSnapshot().gridSnapping ? snapToGrid : (value: number) => value;
    node = { ...node, x: snap(center.x - bounds.width / 2), y: snap(center.y - bounds.height / 2) };
    const connection = source
      ? firstPlacementConnection(
          catalog,
          semanticPorts,
          history.getSnapshot().state.links,
          source,
          node,
        )
      : null;
    if (source && !connection)
      throw new Error("This choice no longer supports the connection. Choose another result.");
    controller.cancel();
    history.update((current) =>
      reconcileTransportConnections({
        ...current,
        nodes: [...current.nodes, node],
        links: connection
          ? [...current.links, { id: crypto.randomUUID(), ...connection }]
          : current.links,
      }),
    );
    controller.setSelection(new Set([node.id]));
    return node;
  }
  let configurationDocument: FactoryDocument | null = null;
  let configurationValidator: ReturnType<typeof createConfigurationValidator> | null = null;
  function canConfigure(candidate: FactoryNode) {
    const document = history.getSnapshot().state;
    if (document !== configurationDocument) {
      configurationDocument = document;
      configurationValidator = createConfigurationValidator(document, catalog);
    }
    return configurationValidator!(candidate);
  }
  function replaceNode(candidate: FactoryNode) {
    if (controller.getSnapshot().interaction !== "idle") return;
    history.update((current) => {
      if (current.nodes.includes(candidate) || !canConfigure(candidate)) return current;
      return {
        ...current,
        nodes: current.nodes.map((node) => (node.id === candidate.id ? candidate : node)),
      };
    });
  }
  function setLinkTier(id: string, tier: number) {
    const link = history.getSnapshot().state.links.find((entry) => entry.id === id);
    const port =
      link &&
      semanticPorts.find(
        (entry) => entry.nodeId === link.output.nodeId && entry.portKey === link.output.portKey,
      );
    if (
      !port ||
      !isMaterialTransport(port.transport) ||
      !Number.isInteger(tier) ||
      tier < 1 ||
      tier > (port.transport === "belt" ? 6 : 2)
    )
      throw new Error("Invalid transport tier.");
    history.update((current) => ({
      ...current,
      links: current.links.map((entry) => (entry.id === id ? { ...entry, tier } : entry)),
    }));
  }
  function setRouteSettings(route: TransportRoute) {
    validateTransportRoute(history.getSnapshot().state, route, catalog);
    history.update((current) => {
      const next = reconcileTransportConnections({
        ...current,
        routes: [
          ...(current.routes ?? []).filter((r) => r.id !== route.id),
          structuredClone(route),
        ],
      });
      validateFacilityReferences(next);
      return next;
    });
  }
  function setDepotResearch(research: DepotResearch) {
    if (
      ![research.speedLevel, research.capacityLevel].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 4,
      )
    )
      throw new Error("Invalid depot research.");
    history.update((current) => ({ ...current, depotResearch: { ...research } }));
  }
  return {
    replaceNode,
    canReplaceNode: canConfigure,
    setLinkTier,
    setRouteSettings,
    setDepotResearch,
    setMatrixSupply: (id: string, scope: string, supplied: boolean) =>
      editMachine(id, (node) => setMatrixSupply(node, catalog, scope, supplied)),
    setOperatingSetting,
    setMachineCount,
    getNode: (id: string) => history.getSnapshot().state.nodes.find((node) => node.id === id),
    canPlace,
    placeNode,
    setSplitterProgram,
    connect,
    setRoute,
    updateNodes,
    getLink: (id: string) => history.getSnapshot().state.links.find((link) => link.id === id),
    getMaterials: (ref: PortReference) => portIndex.materials(ref),
    controller,
    history,
    historyCommand,
    clipboardCommand,
    deleteSelection,
    getDisplay: (id: string) => displays.get(id),
  };
}

function sameConfiguration(a: FactoryNode, b: FactoryNode): boolean {
  if (a.kind === "logistics" || b.kind === "logistics")
    return (
      a.kind === "logistics" &&
      b.kind === "logistics" &&
      a.partId === b.partId &&
      a.program === b.program
    );
  if (a.kind !== b.kind || a.machines !== b.machines) return false;
  if (a.kind === "facility" && b.kind === "facility")
    return a.buildingId === b.buildingId && a.configuration === b.configuration;
  if (a.kind === "sink" && b.kind === "sink") return a.sinkId === b.sinkId;
  if (a.kind === "fixed-producer" && b.kind === "fixed-producer")
    return a.producerId === b.producerId;
  if (a.kind === "extractor" && b.kind === "extractor")
    return a.extractorId === b.extractorId && a.resourceId === b.resourceId;
  return (
    a.kind === "manufacturing" &&
    b.kind === "manufacturing" &&
    a.machineId === b.machineId &&
    a.recipeId === b.recipeId
  );
}
