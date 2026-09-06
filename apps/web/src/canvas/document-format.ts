import { parseNodeConfiguration } from "@satisfactory-belt/production";
import {
  createBasicPlan,
  type MaterialEndpoint,
  type MaterialLink,
} from "@satisfactory-belt/planning";

import {
  CANVAS_DOCUMENT_VERSION,
  canvasNodeId,
  type CanvasDocument,
  type CanvasNode,
  type CanvasPortOrder,
  type CanvasRouterPriorities,
  type CanvasRouterRules,
} from "./document";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalStringArray(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  ) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function parsePortOrder(value: unknown): CanvasPortOrder | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Node portOrder must be an object.");
  const input = optionalStringArray(value.input, "Node input port order");
  const output = optionalStringArray(value.output, "Node output port order");
  return {
    ...(input ? { input } : {}),
    ...(output ? { output } : {}),
  };
}

function parseRouterRules(value: unknown): CanvasRouterRules | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Node routerRules must be an object.");
  return Object.fromEntries(
    Object.entries(value).map(([portId, rules]) => {
      const parsed = optionalStringArray(rules, `Rules for ${portId}`);
      if (!parsed) throw new Error(`Rules for ${portId} are required.`);
      return [portId, parsed];
    }),
  );
}

function parseRouterPriorities(
  value: unknown,
): CanvasRouterPriorities | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error("Node routerPriorities must be an object.");
  }
  return Object.fromEntries(
    Object.entries(value).map(([portId, priority]) => {
      if (priority !== "low" && priority !== "medium" && priority !== "high") {
        throw new Error(`Priority for ${portId} is invalid.`);
      }
      return [portId, priority];
    }),
  );
}

function parseNode(value: unknown, index: number): CanvasNode {
  if (!isRecord(value)) throw new Error(`Node ${index + 1} is not an object.`);
  if (typeof value.label !== "string") {
    throw new Error(`Node ${index + 1} has an invalid label.`);
  }
  if (!validNumber(value.x) || !validNumber(value.y)) {
    throw new Error(`Node ${index + 1} has an invalid position.`);
  }
  if (
    !validNumber(value.width) ||
    !validNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    throw new Error(`Node ${index + 1} has an invalid size.`);
  }

  const portOrder = parsePortOrder(value.portOrder);
  const routerPriorities = parseRouterPriorities(value.routerPriorities);
  const routerRules = parseRouterRules(value.routerRules);
  return {
    configuration: parseNodeConfiguration(value.configuration),
    height: value.height,
    label: value.label,
    ...(portOrder ? { portOrder } : {}),
    ...(routerPriorities ? { routerPriorities } : {}),
    ...(routerRules ? { routerRules } : {}),
    width: value.width,
    x: value.x,
    y: value.y,
  };
}

function parseEndpoint(value: unknown, label: string): MaterialEndpoint {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  if (typeof value.nodeId !== "string" || !value.nodeId.trim()) {
    throw new Error(`${label} nodeId must be a non-empty string.`);
  }
  if (typeof value.portId !== "string" || !value.portId.trim()) {
    throw new Error(`${label} portId must be a non-empty string.`);
  }
  return { nodeId: value.nodeId, portId: value.portId };
}

function parseMaterialLink(value: unknown, index: number): MaterialLink {
  if (!isRecord(value))
    throw new Error(`Material Link ${index + 1} is not an object.`);
  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new Error(`Material Link ${index + 1} has an invalid id.`);
  }
  return {
    from: parseEndpoint(value.from, `Material Link ${index + 1} from endpoint`),
    id: value.id,
    to: parseEndpoint(value.to, `Material Link ${index + 1} to endpoint`),
  };
}

export function validateCanvasDocument(value: unknown): CanvasDocument {
  if (!isRecord(value))
    throw new Error("The file does not contain a document.");
  if (value.version !== 3 && value.version !== CANVAS_DOCUMENT_VERSION) {
    throw new Error(`Unsupported document version: ${String(value.version)}.`);
  }
  if (!Array.isArray(value.nodes)) {
    throw new Error("The document does not contain a node list.");
  }

  const nodes = value.nodes.map(parseNode);
  const ids = new Set(nodes.map(canvasNodeId));
  if (ids.size !== nodes.length) throw new Error("Node ids must be unique.");

  const materialLinks =
    value.version === 3
      ? []
      : Array.isArray(value.materialLinks)
        ? value.materialLinks.map(parseMaterialLink)
        : (() => {
            throw new Error(
              "The document does not contain a Material Link list.",
            );
          })();
  if (value.version !== 3 && value.kind !== "basic") {
    throw new Error(`Unsupported Plan Kind: ${String(value.kind)}.`);
  }
  createBasicPlan({
    materialLinks,
    nodes: nodes.map(({ configuration }) => configuration),
  });

  return {
    kind: "basic",
    materialLinks,
    nodes,
    version: CANVAS_DOCUMENT_VERSION,
  };
}

export function parseCanvasDocument(serialized: string): CanvasDocument {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  return validateCanvasDocument(value);
}

export function serializeCanvasDocument(document: CanvasDocument) {
  return JSON.stringify(document, null, 2);
}
