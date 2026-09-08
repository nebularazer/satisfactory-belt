import { expect, test } from "@playwright/test";

test("manually reconnects a restricted-tier Detailed plan before and after reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(async () => {
    const fixtureUrl = "/src/canvas/modular-frame-fixture.ts";
    const storageUrl = "/src/canvas/document-storage.ts";
    const { modularFrameFactory } = await import(fixtureUrl);
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    const factory = modularFrameFactory(false);
    const nodes = factory.nodes.slice(1, 3).map((node: any) => ({
      ...node,
      configuration: {
        ...node.configuration,
        instances: [
          { ...node.configuration.instances[0], clockSpeedPercent: 40 },
        ],
      },
    }));
    await createIndexedDbDocumentStorage().saveWorkspace({
      ...factory,
      nodes,
      materialLinks: [
        {
          id: "ingots",
          from: { nodeId: "smelters", portId: "output:Desc_IronIngot_C" },
          to: { nodeId: "plates", portId: "input:Desc_IronIngot_C" },
        },
      ],
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Create Detailed plan", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Maximum conveyor speed" })
    .selectOption("conveyor-mk1");
  await page
    .getByRole("button", { name: "Create Detailed", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Create Detailed plan" }),
  ).toBeHidden();
  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  const readConnections = () =>
    page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      return (await createIndexedDbDocumentStorage().loadWorkspace()).document
        .connections;
    });
  for (const reload of [false, true]) {
    if (reload) await page.reload();
    await canvas.press("1");
    const ports = await page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const modeUrl = "/src/canvas/editor-mode.ts";
      const portUrl = "/src/canvas/material-port-geometry.ts";
      const viewportUrl = "/src/canvas/viewport.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      const { detailedDocumentToEditor } = await import(modeUrl);
      const { materialPortGeometry } = await import(portUrl);
      const { fitRectangleInViewport } = await import(viewportUrl);
      const document = detailedDocumentToEditor(
        (await createIndexedDbDocumentStorage().loadWorkspace()).document,
      );
      const left = Math.min(...document.nodes.map((node: any) => node.x));
      const top = Math.min(...document.nodes.map((node: any) => node.y));
      const right = Math.max(
        ...document.nodes.map((node: any) => node.x + node.width),
      );
      const bottom = Math.max(
        ...document.nodes.map((node: any) => node.y + node.height),
      );
      const viewport = fitRectangleInViewport(
        { x: left, y: top, width: right - left, height: bottom - top },
        { width: innerWidth, height: innerHeight },
      );
      const link = document.materialLinks[0];
      return [link.from, link.to].map((endpoint) => {
        const node = document.nodes.find(
          (node: any) => node.configuration.id === endpoint.nodeId,
        );
        const { point } = materialPortGeometry(node).find(
          ({ port }: any) => port.id === endpoint.portId,
        );
        return {
          x: point.x * viewport.zoom + viewport.x,
          y: point.y * viewport.zoom + viewport.y,
        };
      });
    });
    await page.mouse.click(ports[0].x, ports[0].y);
    await expect(page.getByText("12 items/min", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Logistics tier" }).click();
    await expect(page.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect.poll(readConnections).toEqual([]);
    await page.mouse.move(ports[0].x, ports[0].y);
    await page.mouse.down();
    await page.mouse.move(ports[1].x, ports[1].y, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () =>
        (await readConnections()).map((edge: any) => edge.tierId),
      )
      .toEqual(["conveyor-mk1"]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(readConnections).toEqual([]);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(async () => (await readConnections()).length).toBe(1);
  }
  expect(errors).toEqual([]);
});

test("creates an arranged Detailed plan through speed settings and reopens it", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(async () => {
    const fixtureUrl = "/src/canvas/modular-frame-fixture.ts";
    const storageUrl = "/src/canvas/document-storage.ts";
    const { modularFrameFactory } = await import(fixtureUrl);
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    const storage = createIndexedDbDocumentStorage();
    const saved = await storage.saveNamed({
      name: "Balanced frames",
      document: modularFrameFactory(false),
    });
    await storage.saveWorkspace(saved.document, saved.id);
  });
  await page.reload();
  const readSaves = () =>
    page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      return createIndexedDbDocumentStorage().listNamed();
    });
  await page
    .getByRole("button", { name: "Create Detailed plan", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Create Detailed plan" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Plan name" })).toHaveCount(
    0,
  );
  await page
    .getByRole("combobox", { name: "Maximum conveyor speed" })
    .selectOption("conveyor-mk1");
  await page
    .getByRole("combobox", { name: "Maximum pipeline speed" })
    .selectOption("pipeline-mk1");
  await page.screenshot({
    path: testInfo.outputPath("conversion-settings.png"),
  });
  await dialog
    .getByRole("button", { name: "Create Detailed", exact: true })
    .click();
  await expect(dialog.getByRole("progressbar")).toBeVisible();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Detailed editor" }),
  ).toHaveAttribute("aria-pressed", "true");
  const saves = await readSaves();
  expect(saves).toHaveLength(2);
  const detailed = saves.find(
    (save: { document: { kind: string } }) => save.document.kind === "detailed",
  )!.document;
  expect(
    detailed.nodes.filter(
      (node: { configuration: { kind: string } }) =>
        node.configuration.kind === "process",
    ),
  ).toHaveLength(65);
  expect(Object.keys(detailed.connectionRoutes)).toHaveLength(
    detailed.connections.length,
  );
  expect(detailed.tiers.map((tier: { id: string }) => tier.id)).toEqual([
    "conveyor-mk1",
    "pipeline-mk1",
  ]);
  const flows = await page.evaluate(async (document) => {
    const moduleUrl = "/src/canvas/material-link-presentation.ts";
    const modeUrl = "/src/canvas/editor-mode.ts";
    const { presentMaterialFlow } = await import(moduleUrl);
    const { detailedDocumentToEditor } = await import(modeUrl);
    return presentMaterialFlow(detailedDocumentToEditor(document)).links;
  }, detailed);
  expect(
    flows.every(
      (flow: { ratePerMinute: number }) =>
        Number.isFinite(flow.ratePerMinute) && flow.ratePerMinute <= 60 + 1e-7,
    ),
  ).toBe(true);
  await page.keyboard.press("1");
  await page.screenshot({ path: testInfo.outputPath("created-detailed.png") });
  await page.getByRole("button", { name: "Basic editor" }).click();
  await expect(
    page.getByRole("button", { name: "Detailed editor" }),
  ).toHaveText("Detailed");
  await page.reload();
  await page.getByRole("button", { name: "Detailed editor" }).click();
  await expect(
    page.getByRole("button", { name: "Detailed editor" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(dialog).toHaveCount(0);
  expect(await readSaves()).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("cancels an active conversion without saving either version", async ({
  page,
}, testInfo) => {
  await page.route(/conversion\.worker\.ts\?worker_file/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'self.onmessage = () => self.postMessage({stage: "Building balancers"});',
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create Detailed plan", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Create Detailed plan" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Create Detailed", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Building balancers");
  await page.screenshot({
    path: testInfo.outputPath("conversion-progress-mobile.png"),
  });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("dialog", { name: "Save plan as" })).toHaveCount(
    0,
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Basic editor" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Create Detailed plan", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      return createIndexedDbDocumentStorage().listNamed();
    }),
  ).toEqual([]);
});
