import { expect, test } from "@playwright/test";

test("reopens a saved request, previews replacement, preserves manual neighbors, and undoes settings with the factory", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1800, height: 1100 });
  const errors: string[] = [];
  const workers: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("worker", (w) => workers.push(w.url()));
  await page.goto("/");
  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  await canvas.press("n");
  await page
    .getByPlaceholder("Search buildings or recipes...")
    .fill("modular frame");
  await page
    .getByRole("button", { name: "Auto-build Modular Frame", exact: true })
    .first()
    .click();
  await page
    .getByText("Alternative recipes · standard recipes by default", {
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Search alternative recipes" })
    .fill("Cast Screws");
  await page.getByLabel("Cast Screws usage").selectOption("required");
  await page.getByRole("button", { name: "Generate production plan" }).click();
  await expect(
    page.getByRole("dialog", { name: "Auto-build production" }),
  ).toBeHidden({ timeout: 20000 });
  const read = () =>
    page.evaluate(async () => {
      const url = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(url);
      return (await createIndexedDbDocumentStorage().loadWorkspace()).document;
    });
  await expect
    .poll(async () => (await read())?.productionSections?.length)
    .toBe(1);
  expect(workers.some((url) => url.includes("arrangement.worker"))).toBe(true);
  // Add a manually connected neighbor that the request does not own.
  await page.evaluate(async () => {
    const url = "/src/canvas/document-storage.ts";
    const storage = (await import(url)).createIndexedDbDocumentStorage();
    const { document } = await storage.loadWorkspace();
    const frame = document.nodes.find(
      (n: any) => n.configuration.processId === "Recipe_ModularFrame_C",
    );
    const rod = document.nodes.find(
      (n: any) => n.configuration.processId === "Recipe_IronRod_C",
    );
    document.nodes.push({
      ...frame,
      label: "Manual neighbor",
      x: frame.x + 512,
      configuration: { ...frame.configuration, id: "manual-neighbor" },
    });
    document.materialLinks.push({
      id: "manual-boundary",
      from: { nodeId: rod.configuration.id, portId: "output:Desc_IronRod_C" },
      to: { nodeId: "manual-neighbor", portId: "input:Desc_IronRod_C" },
    });
    await storage.saveWorkspace(document, null);
  });
  await page.reload();
  const original = await read();
  const openRequest = async () => {
    await page.getByRole("button", { name: "Open canvas menu" }).click();
    await page.getByRole("menuitem", { name: /^Fit all/ }).click();
    const point = await page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const viewportUrl = "/src/canvas/viewport.ts";
      const { document } = await (
        await import(storageUrl)
      )
        .createIndexedDbDocumentStorage()
        .loadWorkspace();
      const nodes = document.nodes;
      const x = Math.min(...nodes.map((n: any) => n.x));
      const y = Math.min(...nodes.map((n: any) => n.y));
      const width = Math.max(...nodes.map((n: any) => n.x + n.width)) - x;
      const height = Math.max(...nodes.map((n: any) => n.y + n.height)) - y;
      const v = (await import(viewportUrl)).fitRectangleInViewport(
        { x, y, width, height },
        { width: innerWidth, height: innerHeight },
      );
      const n = nodes.find(
        (n: any) =>
          document.productionSections[0].nodeIds.includes(n.configuration.id) &&
          n.configuration.processId === "Recipe_ModularFrame_C",
      );
      return {
        x: v.x + (n.x + n.width / 2) * v.zoom,
        y: v.y + (n.y + 25) * v.zoom,
      };
    });
    await page.mouse.click(point.x, point.y);
    await page
      .getByRole("button", { name: "Edit production request", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Edit production request" }),
    ).toBeVisible();
  };
  await openRequest();
  await expect(
    page.getByRole("spinbutton", { name: "Modular Frame rate" }),
  ).toHaveValue("10");
  await page
    .getByText("Alternative recipes · 1 enabled", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search alternative recipes" })
    .fill("Cast Screws");
  await expect(page.getByLabel("Cast Screws usage")).toHaveValue("required");
  await page.getByRole("spinbutton", { name: "Modular Frame rate" }).fill("20");
  await page.getByRole("button", { name: "Preview replacement" }).click();
  const replace = page.getByRole("button", {
    name: "Replace section",
    exact: true,
  });
  await expect(replace).toBeVisible({ timeout: 20000 });
  expect(await read()).toEqual(original);
  await expect(
    page.getByText(/External connections retained: 1/),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("replacement-preview.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = page.getByRole("dialog", { name: "Edit production request" });
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("replacement-preview-mobile.png"),
  });
  await replace.click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(
      async () =>
        (await read()).productionSections[0].settings.outputs[0].ratePerMinute,
    )
    .toBe(20);
  const result = await read();
  expect(
    result.nodes.find((n: any) => n.configuration.id === "manual-neighbor"),
  ).toEqual(
    original.nodes.find((n: any) => n.configuration.id === "manual-neighbor"),
  );
  expect(
    result.materialLinks.find((l: any) => l.id === "manual-boundary").to.nodeId,
  ).toBe("manual-neighbor");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(read).toEqual(original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(read).toEqual(result);
  await page.setViewportSize({ width: 1800, height: 1100 });
  await page.reload();
  await openRequest();
  await expect(
    page.getByRole("spinbutton", { name: "Modular Frame rate" }),
  ).toHaveValue("20");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await read()).toEqual(result);
  expect(errors).toEqual([]);
});

test("cancels the complete layout worker while the page remains responsive", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const requestUrl = "/src/canvas/auto-layout-request.ts";
    const fixtureUrl = "/src/canvas/modular-frame-fixture.ts";
    const modeUrl = "/src/canvas/editor-mode.ts";
    const { requestCanvasArrangement } = await import(requestUrl);
    const { modularFrameFactory } = await import(fixtureUrl);
    const { materializeDetailedCanvas, detailedDocumentToEditor } =
      await import(modeUrl);
    const document = detailedDocumentToEditor(
      materializeDetailedCanvas(modularFrameFactory(false)),
    );
    const abort = new AbortController();
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    const started = performance.now();
    setTimeout(() => abort.abort(), 100);
    try {
      await requestCanvasArrangement(document, abort.signal, "physical");
      return { cancelled: false, ticks, elapsed: performance.now() - started };
    } catch (error) {
      return {
        cancelled: (error as Error).name === "AbortError",
        ticks,
        elapsed: performance.now() - started,
      };
    } finally {
      clearInterval(timer);
    }
  });
  expect(result.cancelled).toBe(true);
  expect(result.ticks).toBeGreaterThan(0);
  expect(result.elapsed).toBeLessThan(2000);
});
