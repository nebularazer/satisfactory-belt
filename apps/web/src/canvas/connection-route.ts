import type { Point } from "./geometry";

/** Canvas coordinates only; these do not describe physical belt lengths. */
export type ConnectionRoute = readonly Point[];

export function parseConnectionRoute(
  value: unknown,
): ConnectionRoute | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.some(
      (point) =>
        typeof point !== "object" ||
        point === null ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y),
    )
  )
    throw new Error(
      "Connection route must contain at least two finite points.",
    );
  return value.map(({ x, y }) => ({ x, y }));
}
