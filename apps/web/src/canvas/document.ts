import type { NodeConfiguration } from "@satisfactory-belt/production";

export const CANVAS_DOCUMENT_VERSION = 2;

export type CanvasNode = Readonly<{
  configuration: NodeConfiguration;
  height: number;
  label: string;
  width: number;
  x: number;
  y: number;
}>;

export function canvasNodeId(node: CanvasNode) {
  return node.configuration.id;
}

export type CanvasDocument = Readonly<{
  nodes: readonly CanvasNode[];
  version: typeof CANVAS_DOCUMENT_VERSION;
}>;

export const EMPTY_CANVAS_DOCUMENT: CanvasDocument = {
  nodes: [],
  version: CANVAS_DOCUMENT_VERSION,
};
