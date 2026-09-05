import type { NodeConfiguration } from "@satisfactory-belt/production";

import { GRID_INTERVAL } from "./grid";

export const NODE_CARD_HEADER_HEIGHT = 48;
export const NODE_CARD_FOOTER_HEIGHT = 48;

export type NodeCardLayout = Readonly<{
  hasFooter: boolean;
  height: number;
  width: number;
}>;

const PROCESS_LAYOUT: NodeCardLayout = {
  hasFooter: true,
  height: GRID_INTERVAL * 8,
  width: GRID_INTERVAL * 8,
};

const TRANSPORT_LAYOUT: NodeCardLayout = PROCESS_LAYOUT;

const BUFFER_LAYOUT: NodeCardLayout = {
  hasFooter: false,
  height: GRID_INTERVAL * 6,
  width: GRID_INTERVAL * 8,
};

const ROUTER_LAYOUT: NodeCardLayout = {
  hasFooter: false,
  height: GRID_INTERVAL * 5,
  width: GRID_INTERVAL * 6,
};

export function nodeCardLayout(
  configuration: Pick<NodeConfiguration, "kind">,
): NodeCardLayout {
  if (configuration.kind === "router") return ROUTER_LAYOUT;
  if (configuration.kind === "buffer") return BUFFER_LAYOUT;
  if (configuration.kind === "transport") return TRANSPORT_LAYOUT;
  return PROCESS_LAYOUT;
}

export function nodeCardPortY(
  cardHeight: number,
  index: number,
  count: number,
) {
  const center = Math.round(cardHeight / 2 / GRID_INTERVAL) * GRID_INTERVAL;
  const start = center - ((count - 1) * GRID_INTERVAL) / 2;
  return start + index * GRID_INTERVAL;
}
