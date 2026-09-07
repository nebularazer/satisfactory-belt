import {
  serializeCanvasDocument,
  validateCanvasDocument,
} from "./document-format";
import type { CanvasDocument } from "./document";
import {
  serializeDetailedCanvasDocument,
  validateDetailedCanvasDocument,
  type DetailedCanvasDocument,
} from "@/detailed-canvas/document";

export type CanvasPlanDocument = CanvasDocument | DetailedCanvasDocument;

function planKind(value: unknown) {
  return typeof value === "object" && value !== null && "kind" in value
    ? value.kind
    : undefined;
}

export function validateCanvasPlanDocument(value: unknown): CanvasPlanDocument {
  return planKind(value) === "detailed"
    ? validateDetailedCanvasDocument(value)
    : validateCanvasDocument(value);
}

export function parseCanvasPlanDocument(serialized: string) {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  return validateCanvasPlanDocument(value);
}

export function serializeCanvasPlanDocument(document: CanvasPlanDocument) {
  return document.kind === "detailed"
    ? serializeDetailedCanvasDocument(document)
    : serializeCanvasDocument(document);
}
