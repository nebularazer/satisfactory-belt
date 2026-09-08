import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("selection fades unrelated cards, keeps them clickable and clears without changing the plan", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(async () => {
    const fixtureUrl = "/src/canvas/modular-frame-fixture.ts";
    const storageUrl = "/src/canvas/document-storage.ts";
    const { modularFrameFactory } = await import(fixtureUrl);
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    await createIndexedDbDocumentStorage().saveWorkspace(
      modularFrameFactory(false),
    );
  });
  await page.reload();
  const arrange = page.getByRole("button", {
    name: "Auto-arrange",
    exact: true,
  });
  await arrange.click();
  await expect(arrange).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const url = "/src/canvas/document-storage.ts";
        const { createIndexedDbDocumentStorage } = await import(url);
        return (
          await createIndexedDbDocumentStorage().loadWorkspace()
        ).document.materialLinks.every((link: any) => link.route);
      }),
    )
    .toBe(true);
  const { nodes, group, link, saved } = await page.evaluate(async () => {
    document.documentElement.classList.remove("dark");
    const storageUrl = "/src/canvas/document-storage.ts";
    const viewportUrl = "/src/canvas/viewport.ts";
    const regionsUrl = "/src/canvas/production-regions.ts";
    const geometryUrl = "/src/canvas/material-link-geometry.ts";
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    const { fitRectangleInViewport } = await import(viewportUrl);
    const { productionRegions } = await import(regionsUrl);
    const { materialLinkPath, materialLinkLabelPoint } = await import(
      geometryUrl
    );
    const saved = (await createIndexedDbDocumentStorage().loadWorkspace())
      .document;
    const x = Math.min(...saved.nodes.map((n: any) => n.x));
    const y = Math.min(...saved.nodes.map((n: any) => n.y));
    const width = Math.max(...saved.nodes.map((n: any) => n.x + n.width)) - x;
    const height = Math.max(...saved.nodes.map((n: any) => n.y + n.height)) - y;
    const viewport = fitRectangleInViewport(
      { x, y, width, height },
      { width: innerWidth, height: innerHeight },
    );
    const point = (x: number, y: number) => ({
      x: x * viewport.zoom + viewport.x,
      y: y * viewport.zoom + viewport.y,
    });
    const group = productionRegions(saved).find((g: any) =>
      g.nodeIds.includes("screws"),
    );
    const linkPoint = materialLinkLabelPoint(
      materialLinkPath(
        saved,
        saved.materialLinks.find((l: any) => l.id === "ore"),
      ),
    );
    return {
      saved,
      nodes: Object.fromEntries(
        saved.nodes.map((n: any) => [
          n.configuration.id,
          {
            ...point(n.x + 10, n.y + 10),
            width: (n.width - 20) * viewport.zoom,
            height: 35 * viewport.zoom,
          },
        ]),
      ),
      group: point(group.x + group.width / 2, group.y + 20),
      link: point(linkPoint.x, linkPoint.y),
    };
  });
  const contrast = async (id: string) => {
    const stats = await sharp(
      await page.screenshot({ clip: nodes[id] }),
    ).stats();
    return stats.channels
      .slice(0, 3)
      .reduce((sum, channel) => sum + channel.stdev, 0);
  };
  const clickNode = async (id: string) => {
    const node = nodes[id];
    await page.mouse.click(node.x + node.width / 2, node.y + node.height / 2);
  };
  const before = {
    miners: await contrast("miners"),
    smelters: await contrast("smelters"),
    plates: await contrast("plates"),
  };
  await clickNode("plates");
  await expect(
    page.getByRole("complementary", {
      name: "Node details: Iron Plate",
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(() => contrast("miners")).toBeLessThan(before.miners * 0.4);
  expect(await contrast("smelters")).toBeGreaterThan(before.smelters * 0.9);
  await page.screenshot({ path: testInfo.outputPath("node-focus.png") });
  // Muted cards retain their normal hit targets.
  await clickNode("miners");
  await expect(
    page.getByRole("complementary", {
      name: "Node details: Iron Ore Extraction",
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(() => contrast("plates")).toBeLessThan(before.plates * 0.4);
  await page.mouse.click(link.x, link.y);
  await expect(
    page.getByRole("complementary", {
      name: "Material Link details: Iron Ore",
      exact: true,
    }),
  ).toBeVisible();
  expect(await contrast("smelters")).toBeGreaterThan(before.smelters * 0.9);
  await page.mouse.click(group.x, group.y);
  await expect(
    page.getByRole("complementary", { name: "Group details", exact: true }),
  ).toBeVisible();
  await expect.poll(() => contrast("miners")).toBeLessThan(before.miners * 0.4);
  await page.screenshot({ path: testInfo.outputPath("group-focus.png") });
  await page.keyboard.press("Escape");
  await expect
    .poll(() => contrast("miners"))
    .toBeGreaterThan(before.miners * 0.9);
  await expect
    .poll(() => contrast("plates"))
    .toBeGreaterThan(before.plates * 0.9);
  expect(
    await page.evaluate(async () => {
      const url = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(url);
      return (await createIndexedDbDocumentStorage().loadWorkspace()).document;
    }),
  ).toEqual(saved);
  expect(errors).toEqual([]);
});
