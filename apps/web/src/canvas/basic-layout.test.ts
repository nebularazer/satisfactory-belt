import { expect, it } from "vitest";
import ELK from "elkjs/lib/elk.bundled.js";
import { generateProduction } from "../auto-build/generate-production";
import { arrangeCanvas } from "./auto-layout";
import { materialPortGeometry } from "./material-port-geometry";
import { routeIsClear } from "./orthogonal-router";

it("routes a Basic modular-frame factory directly through its open corridors", async () => {
  const source = generateProduction({
    outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 10 }],
    allowedAlternateIds: [],
    pinnedRecipes: { Desc_IronScrew_C: "Recipe_Alternate_Screw_C" },
  }).document;
  const result = await arrangeCanvas(source, new ELK(), "aggregate");
  const ports = result.nodes.flatMap(materialPortGeometry);
  for (const link of result.materialLinks) {
    const route = link.route!;
    const from = ports.find(
      (p) => p.nodeId === link.from.nodeId && p.port.id === link.from.portId,
    )!.point;
    const to = ports.find(
      (p) => p.nodeId === link.to.nodeId && p.port.id === link.to.portId,
    )!.point;
    expect(route[0]).toEqual(from);
    expect(route.at(-1)).toEqual(to);
    for (const p of route) {
      expect(p.x, link.id).toBeGreaterThanOrEqual(from.x);
      expect(p.x, link.id).toBeLessThanOrEqual(to.x);
    }
    const travel = route
      .slice(1)
      .reduce(
        (n, p, i) =>
          n + Math.abs(p.x - route[i]!.x) + Math.abs(p.y - route[i]!.y),
        0,
      );
    expect(travel, link.id).toBe(
      Math.abs(to.x - from.x) + Math.abs(to.y - from.y),
    );
    if (from.y === to.y) expect(route, link.id).toEqual([from, to]);
    expect(
      routeIsClear(
        route,
        result.nodes.map((node) => ({ ...node, id: node.configuration.id })),
      ),
    ).toBe(true);
  }
  expect(
    result.materialLinks.map(({ route: _route, ...link }) => link),
  ).toEqual(source.materialLinks);
  expect(await arrangeCanvas(result, new ELK(), "aggregate")).toEqual(result);
});
