import type { NodeConfiguration } from "@satisfactory-belt/production";

import { GRID_INTERVAL } from "./grid";

export const NODE_CARD_HEADER_HEIGHT = 48;
export const NODE_CARD_FOOTER_HEIGHT = 48;

export type NodeCardLayout = Readonly<{
  hasHeader: boolean;
  hasFooter: boolean;
  height: number;
  width: number;
}>;

const PROCESS_LAYOUT: NodeCardLayout = {
  hasHeader: true,
  hasFooter: true,
  height: GRID_INTERVAL * 8,
  width: GRID_INTERVAL * 8,
};

const TRANSPORT_LAYOUT: NodeCardLayout = PROCESS_LAYOUT;

const BUFFER_LAYOUT: NodeCardLayout = {
  hasHeader: true,
  hasFooter: false,
  height: GRID_INTERVAL * 6 + GRID_INTERVAL / 2,
  width: GRID_INTERVAL * 8,
};

const ROUTER_LAYOUT: NodeCardLayout = {
  hasHeader: false,
  hasFooter: false,
  height: GRID_INTERVAL * 4,
  width: GRID_INTERVAL * 4,
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
  layout: Pick<NodeCardLayout, "hasHeader" | "hasFooter" | "height">,
  index: number,
  count: number,
) {
  const bodyEnd = layout.hasFooter
    ? layout.height - NODE_CARD_FOOTER_HEIGHT
    : layout.height;
  const bodyStart = layout.hasHeader ? NODE_CARD_HEADER_HEIGHT : 0;
  const bodyCenter = (bodyStart + bodyEnd) / 2;
  const center =
    Math.round(bodyCenter / (GRID_INTERVAL / 2)) * (GRID_INTERVAL / 2);
  const start = center - ((count - 1) * GRID_INTERVAL) / 2;
  return start + index * GRID_INTERVAL;
}
