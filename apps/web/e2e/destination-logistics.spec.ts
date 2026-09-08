import { expect, test } from "@playwright/test";

test("arranges shared ingot supply into destination groups", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1800, height: 1300 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const original = await page.evaluate(async () => {
    const generateUrl = "/src/auto-build/generate-production.ts";
    const convertUrl = "/src/detailed-conversion/convert.ts";
    const storageUrl = "/src/canvas/document-storage.ts";
    const { generateProduction } = await import(generateUrl);
    const { convertDetailed } = await import(convertUrl);
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    const { document: basic } = generateProduction({
      outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 10 }],
      allowedAlternateIds: [],
      pinnedRecipes: { Desc_IronScrew_C: "Recipe_Alternate_Screw_C" },
    });
    const detailed = convertDetailed(
      basic,
      {
        conveyorTierId: "conveyor-mk1",
        pipelineTierId: "pipeline-mk1",
      },
      () => {},
    );
    await createIndexedDbDocumentStorage().saveWorkspace(detailed);
    return detailed.connections;
  });
  await page.reload();
  await expect(
    page.getByRole("application", { name: "Infinite canvas" }),
  ).toBeVisible();
  const arrange = page.getByRole("button", {
    name: "Auto-arrange",
    exact: true,
  });
  await arrange.click();
  await expect(arrange).toBeEnabled({ timeout: 30_000 });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const storageUrl = "/src/canvas/document-storage.ts";
        const { createIndexedDbDocumentStorage } = await import(storageUrl);
        const { document } =
          await createIndexedDbDocumentStorage().loadWorkspace();
        return Object.keys(document.connectionRoutes ?? {}).length;
      }),
    )
    .toBe(original.length);
  const layout = await page.evaluate(async () => {
    const storageUrl = "/src/canvas/document-storage.ts";
    const modeUrl = "/src/canvas/editor-mode.ts";
    const regionsUrl = "/src/canvas/production-regions.ts";
    const viewportUrl = "/src/canvas/viewport.ts";
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    const { detailedDocumentToEditor } = await import(modeUrl);
    const { productionRegions } = await import(regionsUrl);
    const { fitRectangleInViewport } = await import(viewportUrl);
    const { document } = await createIndexedDbDocumentStorage().loadWorkspace();
    const canvas = detailedDocumentToEditor(document);
    const regions = productionRegions(canvas);
    const ingots = regions.filter(
      (region: any) => region.logistics && region.name.startsWith("Iron Ingot"),
    );
    const bounds = (rects: any[]) => {
      const x = Math.min(...rects.map((r) => r.x));
      const y = Math.min(...rects.map((r) => r.y));
      return {
        x,
        y,
        width: Math.max(...rects.map((r) => r.x + r.width)) - x,
        height: Math.max(...rects.map((r) => r.y + r.height)) - y,
      };
    };
    return {
      names: ingots.map((region: any) => region.name),
      connections: document.connections,
      area: bounds(ingots),
      viewport: fitRectangleInViewport(bounds(canvas.nodes), {
        width: innerWidth,
        height: innerHeight,
      }),
    };
  });
  expect(layout.connections).toEqual(original);
  expect(layout.names).toEqual(
    expect.arrayContaining([
      "Iron Ingot → Cast Screws",
      "Iron Ingot → Iron Plate",
      "Iron Ingot → Iron Rod",
      "Iron Ingot shared distribution",
    ]),
  );
  await page.screenshot({
    path: testInfo.outputPath("destination-overview.png"),
  });
  const { area, viewport } = layout;
  const center = {
    x: (area.x + area.width / 2) * viewport.zoom + viewport.x,
    y: (area.y + area.height / 2) * viewport.zoom + viewport.y,
  };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(900, 650, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  const zoom = Math.min(1600 / area.width, 1100 / area.height);
  await page.mouse.wheel(0, -Math.log(zoom / viewport.zoom) / 0.002);
  await expect
    .poll(() => page.getByRole("button", { name: /Reset zoom/ }).innerText())
    .toBe(`${Math.round(zoom * 100)}%`);
  await page.screenshot({
    path: testInfo.outputPath("destination-groups.png"),
  });
  expect(errors).toEqual([]);
});
