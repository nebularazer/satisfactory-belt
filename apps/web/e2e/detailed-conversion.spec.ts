import { expect, test } from "@playwright/test";

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
  await expect(dialog.getByRole("alert")).toContainText(/capacity|limit/, {
    timeout: 15_000,
  });
  expect(await readSaves()).toHaveLength(1);
  await page
    .getByRole("combobox", { name: "Maximum conveyor speed" })
    .selectOption("conveyor-mk4");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
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
    "conveyor-mk2",
    "conveyor-mk3",
    "conveyor-mk4",
    "pipeline-mk1",
  ]);
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
