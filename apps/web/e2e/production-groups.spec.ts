import { expect, test } from "@playwright/test";

for (const mode of ["basic", "detailed"] as const)
  test(`${mode === "basic" ? "hides Basic groups" : "renames Detailed groups with summaries, persistent names and vector inspect icons"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.evaluate(async (mode) => {
      const fixtureUrl = "/src/canvas/modular-frame-fixture.ts";
      const modeUrl = "/src/canvas/editor-mode.ts";
      const storageUrl = "/src/canvas/document-storage.ts";
      const { modularFrameFactory } = await import(fixtureUrl);
      const { materializeDetailedCanvas } = await import(modeUrl);
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      const basic = modularFrameFactory(false);
      await createIndexedDbDocumentStorage().saveWorkspace(
        mode === "basic" ? basic : materializeDetailedCanvas(basic),
      );
    }, mode);
    await page.reload();
    const arrange = page.getByRole("button", {
      name: "Auto-arrange",
      exact: true,
    });
    await arrange.click();
    await expect(arrange).toBeEnabled({ timeout: 20_000 });
    const readNames = () =>
      page.evaluate(async () => {
        const storageUrl = "/src/canvas/document-storage.ts";
        const { createIndexedDbDocumentStorage } = await import(storageUrl);
        return (
          (await createIndexedDbDocumentStorage().loadWorkspace()).document
            .groupNames ?? {}
        );
      });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const storageUrl = "/src/canvas/document-storage.ts";
          const { createIndexedDbDocumentStorage } = await import(storageUrl);
          const document = (
            await createIndexedDbDocumentStorage().loadWorkspace()
          ).document;
          return document.kind === "basic"
            ? document.materialLinks.every((link: any) => !!link.route)
            : Object.keys(document.connectionRoutes ?? {}).length ===
                document.connections.length;
        }),
      )
      .toBe(true);
    const group = await page.evaluate(async () => {
      const storageUrl = "/src/canvas/document-storage.ts";
      const modeUrl = "/src/canvas/editor-mode.ts";
      const regionUrl = "/src/canvas/production-regions.ts";
      const viewportUrl = "/src/canvas/viewport.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      const { detailedDocumentToEditor } = await import(modeUrl);
      const { productionRegions } = await import(regionUrl);
      const { fitRectangleInViewport } = await import(viewportUrl);
      const saved = (await createIndexedDbDocumentStorage().loadWorkspace())
        .document;
      const document =
        saved.kind === "basic" ? saved : detailedDocumentToEditor(saved);
      const group = productionRegions(document).find(
        (group: any) => !group.logistics,
      );
      const nodes = document.nodes;
      const x = Math.min(...nodes.map((node: any) => node.x));
      const y = Math.min(...nodes.map((node: any) => node.y));
      const width =
        Math.max(...nodes.map((node: any) => node.x + node.width)) - x;
      const height =
        Math.max(...nodes.map((node: any) => node.y + node.height)) - y;
      const viewport = fitRectangleInViewport(
        { x, y, width, height },
        { width: innerWidth, height: innerHeight },
      );
      return {
        id: group.id,
        name: group.name,
        x: (group.x + 16) * viewport.zoom + viewport.x,
        y: (group.y + 16) * viewport.zoom + viewport.y,
      };
    });
    await page.mouse.click(group.x, group.y);
    const inspector = page.getByRole("complementary", {
      name: "Group details",
    });
    if (mode === "basic") {
      await expect(inspector).toBeHidden();
      await page.screenshot({
        path: testInfo.outputPath("basic-without-groups.png"),
      });
      expect(await readNames()).toEqual({});
      expect(errors).toEqual([]);
      return;
    }
    await expect(inspector).toBeVisible();
    await expect(
      inspector.getByRole("heading", { name: "Recipe production" }),
    ).toBeVisible();
    await expect(inspector.locator("svg.lucide-scan-eye")).toBeVisible();
    await inspector
      .getByRole("textbox", { name: "Group name" })
      .fill("A".repeat(160));
    await inspector
      .getByRole("button", { name: "Save name", exact: true })
      .click();
    const title = inspector.getByRole("heading", {
      name: "A".repeat(160),
      exact: true,
    });
    await expect(title).toBeVisible();
    const headingBounds = await title.boundingBox();
    const inspectorBounds = await inspector.boundingBox();
    expect(headingBounds!.x + headingBounds!.width).toBeLessThan(
      inspectorBounds!.x + inspectorBounds!.width,
    );
    expect(headingBounds!.height).toBeLessThanOrEqual(48);
    await inspector
      .getByRole("button", { name: "Reset name", exact: true })
      .click();
    const name =
      "Northern production — reinforced plate supply and distribution";
    await page.getByRole("textbox", { name: "Group name" }).fill(name);
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await expect.poll(readNames).toEqual({ [group.id]: name });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Group name" })).toHaveValue(
      group.name,
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Group name" })).toHaveValue(
      name,
    );
    await page.screenshot({ path: testInfo.outputPath("group-overview.png") });
    await page.getByRole("button", { name: "Close group details" }).click();
    // Center the inspect icon before zooming, keeping its full boundary on screen.
    await page.mouse.move(group.x, group.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(800, 180, { steps: 6 });
    await page.mouse.up({ button: "middle" });
    const previousZoom = await page
      .getByRole("button", { name: /Reset zoom/ })
      .innerText();
    await page.mouse.wheel(
      0,
      -Math.log(3 / (parseFloat(previousZoom) / 100)) / 0.002,
    );
    await expect(
      page.getByRole("button", { name: /Reset zoom/ }),
    ).not.toHaveText(previousZoom);
    await page.screenshot({ path: testInfo.outputPath("group-close.png") });
    await page.reload();
    expect(await readNames()).toEqual({ [group.id]: name });
    await arrange.click();
    await expect(arrange).toBeEnabled({ timeout: 20_000 });
    expect(await readNames()).toEqual({ [group.id]: name });
    expect(errors).toEqual([]);
  });
