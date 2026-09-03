import type { CanvasDocument, CanvasNode } from "./document";
import type { Point, Rectangle } from "./geometry";

const CELL_SIZE = 512;

type IndexedNode = {
  cells: readonly string[];
  node: CanvasNode;
};

function normalized(rectangle: Rectangle): Rectangle {
  return {
    height: Math.abs(rectangle.height),
    width: Math.abs(rectangle.width),
    x: rectangle.width < 0 ? rectangle.x + rectangle.width : rectangle.x,
    y: rectangle.height < 0 ? rectangle.y + rectangle.height : rectangle.y,
  };
}

function cellsFor(rectangle: Rectangle) {
  const area = normalized(rectangle);
  const minX = Math.floor(area.x / CELL_SIZE);
  const minY = Math.floor(area.y / CELL_SIZE);
  const maxX = Math.floor((area.x + area.width) / CELL_SIZE);
  const maxY = Math.floor((area.y + area.height) / CELL_SIZE);
  const cells: string[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) cells.push(`${x}:${y}`);
  }

  return cells;
}

function intersects(node: CanvasNode, rectangle: Rectangle) {
  const area = normalized(rectangle);
  return (
    node.x < area.x + area.width &&
    node.x + node.width > area.x &&
    node.y < area.y + area.height &&
    node.y + node.height > area.y
  );
}

export function createCanvasSpatialIndex(initialDocument: CanvasDocument) {
  const buckets = new Map<string, Set<string>>();
  const entries = new Map<string, IndexedNode>();
  const order = new Map<string, number>();

  const remove = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;

    for (const cell of entry.cells) {
      const bucket = buckets.get(cell);
      bucket?.delete(id);
      if (bucket?.size === 0) buckets.delete(cell);
    }
    entries.delete(id);
    order.delete(id);
  };

  const add = (node: CanvasNode) => {
    remove(node.id);
    const cells = cellsFor(node);
    entries.set(node.id, { cells, node });
    for (const cell of cells) {
      const bucket = buckets.get(cell) ?? new Set<string>();
      bucket.add(node.id);
      buckets.set(cell, bucket);
    }
  };

  const reindexOrder = (document: CanvasDocument) => {
    order.clear();
    document.nodes.forEach((node, index) => order.set(node.id, index));
  };

  const replace = (document: CanvasDocument) => {
    buckets.clear();
    entries.clear();
    for (const node of document.nodes) add(node);
    reindexOrder(document);
  };

  replace(initialDocument);

  return {
    apply(
      document: CanvasDocument,
      before: readonly CanvasNode[],
      after: readonly CanvasNode[],
    ) {
      for (const node of before) remove(node.id);
      for (const node of after) add(node);
      reindexOrder(document);
    },
    get(id: string) {
      return entries.get(id)?.node;
    },
    indexOf(id: string) {
      return order.get(id);
    },
    hitTest(point: Point) {
      const bucket = buckets.get(
        `${Math.floor(point.x / CELL_SIZE)}:${Math.floor(point.y / CELL_SIZE)}`,
      );
      let hit: CanvasNode | undefined;
      let hitOrder = -1;

      for (const id of bucket ?? []) {
        const node = entries.get(id)?.node;
        const nodeOrder = order.get(id) ?? -1;
        if (
          node &&
          nodeOrder > hitOrder &&
          point.x >= node.x &&
          point.x <= node.x + node.width &&
          point.y >= node.y &&
          point.y <= node.y + node.height
        ) {
          hit = node;
          hitOrder = nodeOrder;
        }
      }

      return hit;
    },
    query(rectangle: Rectangle) {
      const area = normalized(rectangle);
      const cellCount =
        (Math.floor((area.x + area.width) / CELL_SIZE) -
          Math.floor(area.x / CELL_SIZE) +
          1) *
        (Math.floor((area.y + area.height) / CELL_SIZE) -
          Math.floor(area.y / CELL_SIZE) +
          1);
      const candidateIds = new Set<string>();

      if (cellCount > Math.max(buckets.size * 4, 10_000)) {
        for (const id of entries.keys()) candidateIds.add(id);
      } else {
        for (const cell of cellsFor(area)) {
          for (const id of buckets.get(cell) ?? []) candidateIds.add(id);
        }
      }

      return [...candidateIds]
        .map((id) => entries.get(id)?.node)
        .filter((node): node is CanvasNode =>
          Boolean(node && intersects(node, area)),
        )
        .sort(
          (left, right) =>
            (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
        );
    },
    replace,
  };
}
