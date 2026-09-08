import { expect, test } from "@playwright/test";

test("draws, shapes, saves, and resets orthogonal connections without moving nodes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("application", { name: "Infinite canvas" }),
  ).toBeVisible();
  const initial = await page.evaluate(async () => {
    const fixtureUrl = "/src/canvas/modular-frame-fixture.ts";
    const storageUrl = "/src/canvas/document-storage.ts";
    const { modularFrameFactory } = await import(fixtureUrl);
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    const factory = modularFrameFactory(false);
    const document = {
      ...factory,
      materialLinks: [],
      nodes: factory.nodes
        .slice(0, 2)
        .map((node, index) => ({ ...node, x: index * 640, y: index * 160 })),
    };
    document.nodes.push({
      configuration: {
        kind: "router",
        id: "obstacle",
        buildableId: "Build_ConveyorAttachmentSplitter_C",
      },
      label: "Splitter",
      x: 320,
      y: 64,
      width: 128,
      height: 128,
    });
    await createIndexedDbDocumentStorage().saveWorkspace(document);
    return document;
  });
  await page.reload();
  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  await canvas.press("1");
  const readDocument = () =>
    page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      return (await createIndexedDbDocumentStorage().loadWorkspace()).document;
    });
  const coordinates = () =>
    page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const portUrl = "/src/canvas/material-port-geometry.ts";
      const pathUrl = "/src/canvas/material-link-geometry.ts";
      const editUrl = "/src/canvas/route-editing.ts";
      const routerUrl = "/src/canvas/orthogonal-router.ts";
      const viewportUrl = "/src/canvas/viewport.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      const { materialPortGeometry } = await import(portUrl);
      const { materialLinkPath, routeObstacles } = await import(pathUrl);
      const { routeHandles, moveRouteSegment } = await import(editUrl);
      const { routeIsClear } = await import(routerUrl);
      const { fitRectangleInViewport } = await import(viewportUrl);
      const document = (await createIndexedDbDocumentStorage().loadWorkspace())
        .document;
      const left = Math.min(
        ...document.nodes.map((node: { x: number }) => node.x),
      );
      const top = Math.min(
        ...document.nodes.map((node: { y: number }) => node.y),
      );
      const right = Math.max(
        ...document.nodes.map(
          (node: { x: number; width: number }) => node.x + node.width,
        ),
      );
      const bottom = Math.max(
        ...document.nodes.map(
          (node: { y: number; height: number }) => node.y + node.height,
        ),
      );
      const viewport = fitRectangleInViewport(
        { x: left, y: top, width: right - left, height: bottom - top },
        { width: innerWidth, height: innerHeight },
      );
      const screen = (point: { x: number; y: number }) => ({
        x: point.x * viewport.zoom + viewport.x,
        y: point.y * viewport.zoom + viewport.y,
      });
      const from = materialPortGeometry(document.nodes[0]).find(
        ({ port }: { port: { direction: string } }) =>
          port.direction === "output",
      ).point;
      const to = materialPortGeometry(document.nodes[1]).find(
        ({ port }: { port: { direction: string } }) =>
          port.direction === "input",
      ).point;
      const link = document.materialLinks[0];
      const path = link ? materialLinkPath(document, link) : undefined;
      let drag;
      if (path)
        for (const handle of routeHandles(path.route)) {
          for (const delta of [-64, 64, -32, 32]) {
            const at = {
              ...handle.point,
              [handle.axis]: handle.point[handle.axis] + delta,
            };
            const route = moveRouteSegment(handle.route, handle.index, at);
            if (
              routeIsClear(
                route,
                routeObstacles(document.nodes),
                link.from.nodeId,
                link.to.nodeId,
              )
            ) {
              drag = { start: screen(handle.point), end: screen(at) };
              break;
            }
          }
          if (drag) break;
        }
      return {
        from: screen(from),
        to: screen(to),
        drag,
        clear: path
          ? routeIsClear(
              path.route,
              routeObstacles(document.nodes),
              link.from.nodeId,
              link.to.nodeId,
            )
          : undefined,
      };
    });
  const ports = await coordinates();
  await page.mouse.move(ports.from.x, ports.from.y);
  await page.mouse.down();
  await page.mouse.move(ports.to.x, ports.to.y, { steps: 8 });
  await page.screenshot({
    path: testInfo.outputPath("orthogonal-preview.png"),
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await readDocument()).materialLinks.length)
    .toBe(1);
  const automatic = await readDocument();
  expect(automatic.nodes).toEqual(initial.nodes);
  const points = await coordinates();
  expect(points.clear).toBe(true);
  expect(points.drag).toBeDefined();
  const drag = points.drag!;
  await page.mouse.click(drag.start.x, drag.start.y);
  await expect(
    page.getByRole("button", { name: "Add bend", exact: true }),
  ).toBeVisible();
  await page.mouse.move(drag.start.x, drag.start.y);
  await page.mouse.down();
  await page.mouse.move(drag.end.x, drag.end.y, { steps: 6 });
  await page.screenshot({
    path: testInfo.outputPath("route-drag-preview.png"),
  });
  expect(await readDocument()).toEqual(automatic);
  await page.mouse.up();
  await expect
    .poll(async () => (await readDocument()).materialLinks[0].routeMode)
    .toBe("manual");
  const manual = await readDocument();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(readDocument).toEqual(automatic);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(readDocument).toEqual(manual);
  await page.reload();
  await canvas.press("1");
  expect(await readDocument()).toEqual(manual);
  const restored = await coordinates();
  await page.mouse.click(restored.drag!.start.x, restored.drag!.start.y);
  await page.getByRole("button", { name: "Add bend", exact: true }).click();
  await expect
    .poll(async () => (await readDocument()).materialLinks[0].route.length)
    .toBeGreaterThan(manual.materialLinks[0].route.length);
  await page.screenshot({
    path: testInfo.outputPath("manual-route-bends.png"),
  });
  await page.getByRole("button", { name: "Reset route", exact: true }).click();
  await expect
    .poll(async () => (await readDocument()).materialLinks[0].routeMode)
    .toBeUndefined();
  expect((await readDocument()).nodes).toEqual(initial.nodes);
  expect((await coordinates()).clear).toBe(true);
  expect(errors).toEqual([]);
});
