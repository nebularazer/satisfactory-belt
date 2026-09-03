export const CANVAS_DOCUMENT_VERSION = 1;

export type CanvasNode = Readonly<{
  height: number;
  id: string;
  label: string;
  width: number;
  x: number;
  y: number;
}>;

export type CanvasDocument = Readonly<{
  nodes: readonly CanvasNode[];
  version: typeof CANVAS_DOCUMENT_VERSION;
}>;

export const EMPTY_CANVAS_DOCUMENT: CanvasDocument = {
  nodes: [],
  version: CANVAS_DOCUMENT_VERSION,
};
