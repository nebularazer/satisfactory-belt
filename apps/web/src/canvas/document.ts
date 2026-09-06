import type { NodeConfiguration } from "@satisfactory-belt/production";
import type {
  GenerationProvenance,
  MaterialLink,
} from "@satisfactory-belt/planning";

export const CANVAS_DOCUMENT_VERSION = 4;

export type CanvasPortOrder = Readonly<{
  input?: readonly string[];
  output?: readonly string[];
}>;

export type CanvasRouterRules = Readonly<Record<string, readonly string[]>>;

export type CanvasRouterPriorities = Readonly<
  Record<string, "high" | "low" | "medium">
>;

export type CanvasNode = Readonly<{
  configuration: NodeConfiguration;
  height: number;
  label: string;
  portOrder?: CanvasPortOrder;
  provenance?: GenerationProvenance;
  routerPriorities?: CanvasRouterPriorities;
  routerRules?: CanvasRouterRules;
  width: number;
  x: number;
  y: number;
}>;

export function canvasNodeId(node: CanvasNode) {
  return node.configuration.id;
}

export type CanvasDocument = Readonly<{
  kind: "basic";
  materialLinks: readonly MaterialLink[];
  nodes: readonly CanvasNode[];
  version: typeof CANVAS_DOCUMENT_VERSION;
}>;

export const EMPTY_CANVAS_DOCUMENT: CanvasDocument = {
  kind: "basic",
  materialLinks: [],
  nodes: [],
  version: CANVAS_DOCUMENT_VERSION,
};

export type CanvasMaterialLink = MaterialLink;
