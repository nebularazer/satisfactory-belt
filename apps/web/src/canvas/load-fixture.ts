import { CANVAS_DOCUMENT_VERSION, type CanvasDocument } from "./document";
import { NODE_HEIGHT, NODE_WIDTH, SNAP_INTERVAL } from "./editor";

export const LOAD_FIXTURE_LIMIT = 10_000;

export function createCanvasLoadFixture(nodeCount: number): CanvasDocument {
  const count = Math.max(
    0,
    Math.min(LOAD_FIXTURE_LIMIT, Math.floor(nodeCount)),
  );
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const horizontalStep = NODE_WIDTH + SNAP_INTERVAL;
  const verticalStep = NODE_HEIGHT + SNAP_INTERVAL;
  const originX = -((columns - 1) * horizontalStep) / 2;
  const originY = -((rows - 1) * verticalStep) / 2;

  return {
    nodes: Array.from({ length: count }, (_, index) => ({
      configuration: {
        buildableId: "Build_ConveyorAttachmentSplitter_C",
        id: `fixture-node-${index + 1}`,
        kind: "router" as const,
      },
      height: NODE_HEIGHT,
      label: `Node ${index + 1}`,
      width: NODE_WIDTH,
      x: originX + (index % columns) * horizontalStep,
      y: originY + Math.floor(index / columns) * verticalStep,
    })),
    version: CANVAS_DOCUMENT_VERSION,
  };
}

export function loadFixtureNodeCount(search: string) {
  const value = new URLSearchParams(search).get("nodes");
  if (!value) return 0;

  const count = Number(value);
  return Number.isFinite(count)
    ? Math.max(0, Math.min(LOAD_FIXTURE_LIMIT, Math.floor(count)))
    : 0;
}
