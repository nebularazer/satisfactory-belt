import { expect, test } from "@playwright/test";

test("Basic generation and Auto-arrange keep open-corridor links direct", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1800, height: 1100 });
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
  await page.getByRole("spinbutton", { name: "Modular Frame rate" }).fill("10");
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
      const storageUrl = "/src/canvas/document-storage.ts";
      const { createIndexedDbDocumentStorage } = await import(storageUrl);
      return (await createIndexedDbDocumentStorage().loadWorkspace()).document;
    });
  await expect.poll(async () => (await read()).nodes.length).toBe(7);
  const validate = (document: Awaited<ReturnType<typeof read>>) => {
    for (const link of document.materialLinks) {
      const route = link.route as { x: number; y: number }[];
      const from = route[0]!,
        to = route.at(-1)!;
      const travel = route
        .slice(1)
        .reduce(
          (sum, p, i) =>
            sum + Math.abs(p.x - route[i]!.x) + Math.abs(p.y - route[i]!.y),
          0,
        );
      expect(travel, link.id).toBe(
        Math.abs(to.x - from.x) + Math.abs(to.y - from.y),
      );
      if (from.y === to.y) expect(route, link.id).toEqual([from, to]);
    }
  };
  const generated = await read();
  validate(generated);
  // Start the toolbar workflow from an unarranged saved plan so undo has
  // a distinct state to restore even when generation is already deterministic.
  await page.evaluate(async () => {
    const storageUrl = "/src/canvas/document-storage.ts";
    const { createIndexedDbDocumentStorage } = await import(storageUrl);
    const storage = createIndexedDbDocumentStorage();
    const { document } = await storage.loadWorkspace();
    document.nodes[0].y += 64;
    for (const link of document.materialLinks) delete link.route;
    await storage.saveWorkspace(document);
  });
  await page.reload();
  const original = await read();
  // Exercise the toolbar entry point as well as Auto-build's arrangement.
  const arrange = page.getByRole("button", {
    name: "Auto-arrange",
    exact: true,
  });
  await arrange.click();
  await expect(arrange).toBeEnabled({ timeout: 20000 });
  await expect
    .poll(async () =>
      (await read()).materialLinks.every((link: any) => !!link.route),
    )
    .toBe(true);
  const arranged = await read();
  validate(arranged);
  await page.screenshot({
    path: testInfo.outputPath("basic-direct-links.png"),
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(read).toEqual(original);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(read).toEqual(arranged);
  await page.reload();
  expect(await read()).toEqual(arranged);
  expect(errors).toEqual([]);
});
