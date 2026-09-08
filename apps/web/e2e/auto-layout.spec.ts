import { expect, test } from "@playwright/test";

test("auto-arranges a Detailed factory, undoes it, and restores routes after reload", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1800, height: 1100 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Auto-arrange", exact: true }),
  ).toBeDisabled();
  const original = await page.evaluate(async () => {
    const fixtureUrl = "/src/canvas/modular-frame-fixture.ts";
    const modeUrl = "/src/canvas/editor-mode.ts";
    const storageUrl = "/src/canvas/document-storage.ts";
    const { modularFrameFactory } = await import(fixtureUrl);
    const { materializeDetailedCanvas } = await import(modeUrl);
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    const document = materializeDetailedCanvas(modularFrameFactory(false));
    await createIndexedDbDocumentStorage().saveWorkspace(document);
    return document;
  });
  await page.reload();
  const readDocument = () =>
    page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      return (await createIndexedDbDocumentStorage().loadWorkspace()).document;
    });
  await expect(
    page.getByRole("button", { name: "Detailed editor" }),
  ).toHaveAttribute("aria-pressed", "true");
  const arrange = page.getByRole("button", {
    name: "Auto-arrange",
    exact: true,
  });
  await arrange.click();
  await expect(arrange).toBeEnabled({ timeout: 20_000 });
  await expect
    .poll(
      async () =>
        Object.keys((await readDocument()).connectionRoutes ?? {}).length,
    )
    .toBe(original.connections.length);
  const arranged = await readDocument();
  expect(arranged.nodes).not.toEqual(original.nodes);
  expect(arranged.connections).toEqual(original.connections);
  await page.screenshot({ path: testInfo.outputPath("detailed-arranged.png") });
  for (let step = 0; step < 8; step++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath("detailed-arranged-close.png"),
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(readDocument).toEqual(original);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(readDocument).toEqual(arranged);
  await page.reload();
  await expect(arrange).toBeEnabled();
  expect(await readDocument()).toEqual(arranged);
  await arrange.click();
  await expect(arrange).toBeEnabled({ timeout: 20_000 });
  await expect.poll(readDocument).toEqual(arranged);
  expect(errors).toEqual([]);
});
