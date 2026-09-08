import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("paints delayed images without interaction and restores recycled cards at the same zoom", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/");
  await page.evaluate(async () => {
    const fixtureUrl = "/src/canvas/modular-frame-fixture.ts";
    const storageUrl = "/src/canvas/document-storage.ts";
    const { modularFrameFactory } = await import(fixtureUrl);
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    const document = modularFrameFactory(false);
    await createIndexedDbDocumentStorage().saveWorkspace({
      ...document,
      nodes: [document.nodes[0]],
      materialLinks: [],
    });
  });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*.webp*", async (route) => {
    await ready;
    await route.continue();
  });
  await page.reload();
  // Fit all needs the mounted renderer; the toolbar can appear before it.
  await expect(
    page.getByRole("application", { name: "Infinite canvas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open canvas menu" }).click();
  await page.getByRole("menuitem", { name: /^Fit all/ }).click();
  // The lone 256px card is centered at 100% zoom by Fit all.
  const icon = { x: 390, y: 276, width: 40, height: 40 };
  const contrast = async () => {
    const stats = await sharp(await page.screenshot({ clip: icon })).stats();
    return stats.channels[0]!.stdev;
  };
  const empty = await contrast();
  release();
  await expect.poll(contrast).toBeGreaterThan(empty + 15);
  const loaded = await contrast();
  await page.mouse.move(500, 500);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(-1500, 500, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await expect.poll(contrast).toBeLessThan(loaded / 2);
  await page.mouse.move(100, 500);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(2100, 500, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await expect.poll(contrast).toBeGreaterThan(loaded * 0.9);
  await page.screenshot({ path: testInfo.outputPath("restored-assets.png") });
});
