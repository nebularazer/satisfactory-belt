import { CANVAS_DOCUMENT_VERSION, type CanvasDocument } from "./document";
import { GRID_INTERVAL } from "./grid";
import { nodeCardLayout } from "./node-card-layout";

export const LOAD_FIXTURE_LIMIT = 10_000;

export function createCanvasLoadFixture(nodeCount: number): CanvasDocument {
  const count = Math.max(
    0,
    Math.min(LOAD_FIXTURE_LIMIT, Math.floor(nodeCount)),
  );
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const configuration = {
    buildableId: "Build_ConveyorAttachmentSplitter_C",
    id: "fixture-node",
    kind: "router" as const,
  };
  const layout = nodeCardLayout(configuration);
  const horizontalStep = layout.width + GRID_INTERVAL;
  const verticalStep = layout.height + GRID_INTERVAL;
  const originX = -((columns - 1) * horizontalStep) / 2;
  const originY = -((rows - 1) * verticalStep) / 2;

  return {
    nodes: Array.from({ length: count }, (_, index) => ({
      configuration: {
        ...configuration,
        id: `fixture-node-${index + 1}`,
      },
      height: layout.height,
      label: `Node ${index + 1}`,
      width: layout.width,
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
