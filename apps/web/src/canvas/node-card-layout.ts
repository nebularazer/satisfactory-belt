import type { NodeConfiguration } from "@satisfactory-belt/production";

export const NODE_CARD_GRID_UNIT = 32;
export const NODE_CARD_HEADER_HEIGHT = 48;
export const NODE_CARD_FOOTER_HEIGHT = 48;

export type NodeCardLayout = Readonly<{
  hasFooter: boolean;
  height: number;
  width: number;
}>;

const PROCESS_LAYOUT: NodeCardLayout = {
  hasFooter: true,
  height: NODE_CARD_GRID_UNIT * 8,
  width: NODE_CARD_GRID_UNIT * 8,
};

const TRANSPORT_LAYOUT: NodeCardLayout = PROCESS_LAYOUT;

const BUFFER_LAYOUT: NodeCardLayout = {
  hasFooter: false,
  height: NODE_CARD_GRID_UNIT * 6,
  width: NODE_CARD_GRID_UNIT * 8,
};

const ROUTER_LAYOUT: NodeCardLayout = {
  hasFooter: false,
  height: NODE_CARD_GRID_UNIT * 5,
  width: NODE_CARD_GRID_UNIT * 6,
};

export function nodeCardLayout(
  configuration: Pick<NodeConfiguration, "kind">,
): NodeCardLayout {
  if (configuration.kind === "router") return ROUTER_LAYOUT;
  if (configuration.kind === "buffer") return BUFFER_LAYOUT;
  if (configuration.kind === "transport") return TRANSPORT_LAYOUT;
  return PROCESS_LAYOUT;
}
