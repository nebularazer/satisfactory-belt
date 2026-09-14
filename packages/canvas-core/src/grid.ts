/** World units: node dimensions can use 32-unit cells and ports 16-unit half-cells. */
export const GRID_SIZE = 32;
export const SNAP_SIZE = GRID_SIZE / 2;

export function snapToGrid(value: number): number {
  return Math.round(value / SNAP_SIZE) * SNAP_SIZE;
}
