import {
  createConnectionIndex,
  isFlowGroup,
  resolveSemanticPorts,
  validateExternalFlows,
  validateFactoryNode,
  validateFacilityReferences,
  validateFlowSettings,
  validateTransportRoute,
} from "@satisfactory-belt/factory-core";
import type { FactoryDocument } from "@satisfactory-belt/factory-core";
import type { GameCatalog } from "@satisfactory-belt/game-data";

const FORMAT = "satisfactory-belt-factory";
const VERSION = 1;
export interface FactoryFile {
  name: string;
  document: FactoryDocument;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object in the factory document.");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Checked object shape; every accessed property remains unknown.
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected a list in the factory document.");
  return value;
}
function identity(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid factory identity.");
}
function port(value: unknown) {
  const reference = record(value);
  identity(reference.nodeId);
  identity(reference.portKey);
}
function uniqueIds(values: unknown[]) {
  const ids = new Set<string>();
  for (const value of values) {
    const { id } = record(value);
    if (typeof id !== "string" || !id.trim() || ids.has(id))
      throw new Error("Missing or duplicate factory identity.");
    ids.add(id);
  }
}

/** Validate the entire imported graph before editor reconciliation can remove invalid data. */
function readDocument(documentValue: unknown, catalog: GameCatalog): FactoryDocument {
  const raw = record(documentValue);
  const nodes = array(raw.nodes),
    links = array(raw.links);
  uniqueIds(nodes);
  uniqueIds(links);
  for (const value of nodes) {
    const node = record(value);
    identity(node.kind);
    if (node.kind !== "logistics") {
      const machines = array(node.machines);
      uniqueIds(machines);
    }
    if (node.kind === "facility") record(node.configuration);
    if (node.flow !== undefined) {
      const flow = record(node.flow);
      for (const field of ["targets", "memberClocks", "outputLimit"])
        if (flow[field] !== undefined) record(flow[field]);
    }
    if (node.portOrder !== undefined) {
      const order = record(node.portOrder);
      for (const direction of ["input", "output"])
        if (order[direction] !== undefined) {
          const keys = array(order[direction]);
          keys.forEach(identity);
          if (new Set(keys).size !== keys.length) throw new Error("Duplicate port order.");
        }
    }
  }
  for (const value of links) {
    const link = record(value);
    port(link.input);
    port(link.output);
    if (
      link.tier !== undefined &&
      (typeof link.tier !== "number" || !Number.isSafeInteger(link.tier) || link.tier < 1)
    )
      throw new Error("Invalid connection tier.");
    if (link.guides !== undefined)
      for (const guideValue of array(link.guides)) {
        const guide = record(guideValue);
        if (
          (guide.axis !== "x" && guide.axis !== "y") ||
          typeof guide.position !== "number" ||
          !Number.isFinite(guide.position)
        )
          throw new Error("Invalid connection routing.");
      }
  }
  if (raw.routes !== undefined) {
    const routes = array(raw.routes);
    uniqueIds(routes);
    for (const value of routes) {
      const route = record(value);
      identity(route.name);
      const stops = array(route.stops);
      uniqueIds(stops);
      for (const stop of stops) identity(record(stop).nodeId);
    }
  }
  if (raw.externalFlows !== undefined)
    for (const value of array(raw.externalFlows)) {
      const flow = record(value);
      port(flow.port);
      identity(flow.itemId);
    }
  if (raw.depotResearch !== undefined) {
    const research = record(raw.depotResearch);
    for (const level of [research.speedLevel, research.capacityLevel])
      if (typeof level !== "number" || !Number.isSafeInteger(level) || level < 0)
        throw new Error("Invalid depot research level.");
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSON structure checked above; domain validators check all graph references and authored settings below.
  const document = raw as FactoryDocument;
  for (const node of document.nodes) {
    validateFactoryNode(node, catalog);
    if (isFlowGroup(node)) validateFlowSettings(node, catalog);
  }
  for (const route of document.routes ?? []) validateTransportRoute(document, route);
  validateFacilityReferences(document);
  const ports = document.nodes.flatMap((node) => resolveSemanticPorts(node, catalog));
  const index = createConnectionIndex(ports, document.links);
  if (index.invalidLinks().length) throw new Error("Invalid factory connections.");
  validateExternalFlows(document.externalFlows ?? [], ports, index.materials);
  return document;
}

export function serializeFactoryJson(factory: FactoryFile): string {
  const name = factory.name.trim();
  if (!name) throw new Error("Enter a factory name.");
  return (
    JSON.stringify(
      { format: FORMAT, version: VERSION, name, document: factory.document },
      null,
      2,
    ) + "\n"
  );
}

export function parseFactoryJson(text: string, catalog: GameCatalog): FactoryFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const file = record(value);
  if (file.format !== FORMAT) throw new Error("This is not a Satisfactory Belt factory file.");
  if (file.version !== VERSION) throw new Error("This factory file version is not supported.");
  if (typeof file.name !== "string" || !file.name.trim())
    throw new Error("The factory file needs a name.");
  try {
    return { name: file.name.trim(), document: readDocument(file.document, catalog) };
  } catch (reason) {
    throw new Error(
      `The factory document is invalid: ${reason instanceof Error ? reason.message : "unsupported data"}`,
      { cause: reason },
    );
  }
}
