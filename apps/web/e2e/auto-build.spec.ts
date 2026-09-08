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
