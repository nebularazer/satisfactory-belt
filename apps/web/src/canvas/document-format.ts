import {
  CANVAS_DOCUMENT_VERSION,
  type CanvasDocument,
  type CanvasNode,
} from "./document";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseNode(value: unknown, index: number): CanvasNode {
  if (!isRecord(value)) throw new Error(`Node ${index + 1} is not an object.`);
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new Error(`Node ${index + 1} has an invalid id.`);
  }
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

  return {
    ...(typeof value.buildableId === "string"
      ? { buildableId: value.buildableId }
      : {}),
    height: value.height,
    id: value.id,
    label: value.label,
    ...(typeof value.recipeId === "string" ? { recipeId: value.recipeId } : {}),
    width: value.width,
    x: value.x,
    y: value.y,
  };
}

export function validateCanvasDocument(value: unknown): CanvasDocument {
  if (!isRecord(value))
    throw new Error("The file does not contain a document.");
  if (value.version !== CANVAS_DOCUMENT_VERSION) {
    throw new Error(`Unsupported document version: ${String(value.version)}.`);
  }
  if (!Array.isArray(value.nodes)) {
    throw new Error("The document does not contain a node list.");
  }

  const nodes = value.nodes.map(parseNode);
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new Error("Node ids must be unique.");

  return { nodes, version: CANVAS_DOCUMENT_VERSION };
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
