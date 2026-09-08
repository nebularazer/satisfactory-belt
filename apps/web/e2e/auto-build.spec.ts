import { expect, test } from "@playwright/test";

test("auto-builds multiple outputs with an alternative recipe and adds independent undoable groups", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  const openBuilder = async () => {
    await canvas.press("n");
    await page
      .getByPlaceholder("Search buildings or recipes...")
      .fill("modular frame");
    await page
      .getByRole("button", { name: "Auto-build Modular Frame", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "Auto-build production" }),
    ).toBeVisible();
  };
  const readDocument = () =>
    page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      return (await createIndexedDbDocumentStorage().loadWorkspace()).document;
    });
  await openBuilder();
  await page.getByRole("spinbutton", { name: "Modular Frame rate" }).fill("10");
  await page.getByRole("button", { name: "Add another output" }).click();
  await page
    .getByRole("textbox", { name: "Search output items" })
    .fill("Iron Plate");
  await page.getByRole("button", { name: "Iron Plate", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Iron Plate rate" }).fill("20");
  await page
    .getByText("Alternative recipes · standard recipes by default", {
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Search alternative recipes" })
    .fill("Cast Screws");
  await page.getByLabel("Cast Screws usage").selectOption("required");
  await page.screenshot({
    path: testInfo.outputPath("auto-build-settings.png"),
  });
  await page.getByRole("button", { name: "Generate production plan" }).click();
  await expect(
    page.getByRole("dialog", { name: "Auto-build production" }),
  ).not.toBeVisible({ timeout: 20000 });
  await expect
    .poll(async () => (await readDocument())?.nodes.length ?? 0)
    .toBeGreaterThan(5);
  const first = await readDocument();
  expect(
    first.nodes.every((node: any) =>
      node.configuration.instances.every(
        (instance: any) =>
          instance.clockSpeedPercent === undefined ||
          instance.clockSpeedPercent <= 100,
      ),
    ),
  ).toBe(true);
  expect(
    first.nodes.every(
      (node: { configuration: { kind: string } }) =>
        node.configuration.kind === "process",
    ),
  ).toBe(true);
  expect(
    first.nodes.some(
      (node: { configuration: { buildableId: string } }) =>
        node.configuration.buildableId === "Build_Converter_C",
    ),
  ).toBe(false);
  expect(
    first.nodes.some((node: { label: string }) => node.label === "Cast Screws"),
  ).toBe(true);
  expect(
    first.materialLinks.every((link: { route?: unknown }) => link.route),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("auto-built-factory.png"),
  });
  await openBuilder();
  await page.getByLabel("Modular Frame recipe").focus();
  await page.getByLabel("Modular Frame recipe").press("ArrowRight");
  expect(await readDocument()).toEqual(first);
  await page.getByRole("button", { name: "Generate production plan" }).click();
  await expect(
    page.getByRole("dialog", { name: "Auto-build production" }),
  ).not.toBeVisible({ timeout: 20000 });
  await expect
    .poll(async () => (await readDocument()).nodes.length)
    .toBeGreaterThan(first.nodes.length);
  const second = await readDocument();
  expect(second.nodes.slice(0, first.nodes.length)).toEqual(first.nodes);
  expect(
    new Set(
      second.nodes.map(
        (node: { configuration: { id: string } }) => node.configuration.id,
      ),
    ).size,
  ).toBe(second.nodes.length);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(readDocument).toEqual(first);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(readDocument).toEqual(second);
  await page.reload();
  await expect(canvas).toBeVisible();
  expect(await readDocument()).toEqual(second);
  await openBuilder();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await readDocument()).toEqual(second);
  expect(errors).toEqual([]);
});

test("keeps Auto-build settings usable on mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Add your first node" }).click();
  await page
    .getByPlaceholder("Search buildings or recipes...")
    .fill("modular frame");
  await page.screenshot({
    path: testInfo.outputPath("auto-build-search-mobile.png"),
  });
  await page
    .getByRole("button", { name: "Auto-build Modular Frame", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Auto-build production" });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("auto-build-mobile.png") });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add your first node" }),
  ).toBeVisible();
});

test("cancels generation before it can change the canvas", async ({ page }) => {
  await page.route(/generation\.worker\.ts\?worker_file/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "self.onmessage = () => {};",
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Add your first node" }).click();
  await page
    .getByPlaceholder("Search buildings or recipes...")
    .fill("modular frame");
  await page
    .getByRole("button", { name: "Auto-build Modular Frame", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Generate production plan" }).click();
  await expect(
    page.getByRole("progressbar", { name: "Generating production" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Auto-build production" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add your first node" }),
  ).toBeVisible();
});

test("limits mining to available nodes and keeps the form open for a capacity shortfall", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add your first node" }).click();
  await page
    .getByPlaceholder("Search buildings or recipes...")
    .fill("modular frame");
  await page
    .getByRole("button", { name: "Auto-build Modular Frame", exact: true })
    .first()
    .click();
  await page
    .getByText("Available resource nodes · unlimited", { exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Use only my listed mineral and oil nodes" })
    .check();
  await expect(
    page.getByText("Up to 60 items/min", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Generate production plan" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Iron Ore needs 240 items/min; your listed nodes can supply 60 items/min",
  );
  await expect(
    page.getByRole("button", {
      name: "Undo",
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled();
  await page.getByLabel("Iron Ore extractor").selectOption("Build_MinerMk2_C");
  await expect(page.getByRole("alert")).not.toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Iron Ore normal nodes" })
    .fill("0");
  await page.getByRole("spinbutton", { name: "Iron Ore pure nodes" }).fill("1");
  await expect(
    page.getByText("Up to 240 items/min", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("resource-node-budget.png"),
  });
  await page.getByRole("button", { name: "Generate production plan" }).click();
  await expect(
    page.getByRole("dialog", { name: "Auto-build production" }),
  ).not.toBeVisible({ timeout: 20000 });
  const read = () =>
    page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      return (await createIndexedDbDocumentStorage().loadWorkspace()).document;
    });
  await expect
    .poll(async () => (await read())?.nodes?.length ?? 0)
    .toBeGreaterThan(0);
  const document = await read();
  const miner = document.nodes.find(
    (node: { configuration: { processId?: string } }) =>
      node.configuration.processId === "extraction:Desc_OreIron_C",
  );
  expect(miner.configuration).toMatchObject({
    buildableId: "Build_MinerMk2_C",
    instances: [{ resourcePurity: "pure", clockSpeedPercent: 100 }],
  });
  expect(miner.configuration.instances).toHaveLength(1);
  expect(
    document.nodes.some(
      (node: { configuration: { buildableId: string } }) =>
        node.configuration.buildableId === "Build_Converter_C",
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("modular-frames-from-iron.png"),
  });
});
