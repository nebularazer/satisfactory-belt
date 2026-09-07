import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("edits and restores a canvas in a real browser", async ({ page }) => {
  await page.goto("/");

  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  const emptyStateAction = page.getByRole("button", {
    name: "Add your first node",
  });
  const undo = page.getByRole("button", { name: "Undo" });

  await expect(canvas).toBeVisible();
  await emptyStateAction.click();
  const nodePicker = page.getByRole("dialog", { name: "Add node" });
  await expect(nodePicker).toBeVisible();
  await page
    .getByPlaceholder("Search buildings or recipes...")
    .fill("iron plate");
  await page
    .getByRole("option", { name: /^Iron Plate.*Iron Ingot.*Constructor/ })
    .click();
  await expect(nodePicker).toBeHidden();
  await canvas.click({ position: { x: 640, y: 360 } });
  await expect(emptyStateAction).toBeHidden();

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) return;

  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  await canvas.hover({
    position: { x: bounds.width / 2, y: bounds.height / 2 },
  });
  await page.mouse.down();
  await page.mouse.move(center.x + 96, center.y + 64, { steps: 4 });
  await page.mouse.up();

  await undo.click();
  await expect(emptyStateAction).toBeHidden();

  await page.waitForTimeout(400);
  await page.reload();

  await expect(canvas).toBeVisible();
  await expect(emptyStateAction).toBeHidden();
  await expect(undo).toBeDisabled();
});

test("creates, persists, and reopens a separate Detailed plan", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  const basic = page.getByRole("button", { name: "Basic editor" });
  const detailed = page.getByRole("button", { name: "Detailed editor" });
  const emptyState = page.getByRole("button", { name: "Add your first node" });

  await detailed.click();
  await expect(
    page.getByRole("dialog", { name: "Save plan as" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Plan name" }).fill("Mode source");
  await page.getByRole("button", { name: "Save as new" }).click();
  await expect(detailed).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Splitter" }).click();
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.getByRole("button", { name: "Close node details" }).click();
  await expect(emptyState).toBeHidden();

  await page.waitForTimeout(500);
  await page.reload();
  await expect(detailed).toHaveAttribute("aria-pressed", "true");
  await expect(emptyState).toBeHidden();

  await basic.click();
  await expect(basic).toHaveAttribute("aria-pressed", "true");
  await expect(emptyState).toBeVisible();

  await detailed.click();
  await expect(detailed).toHaveAttribute("aria-pressed", "true");
  await expect(emptyState).toBeHidden();
});

test("connects material ports and persists the Material Link", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  const search = page.getByPlaceholder("Search buildings or recipes...");

  await page.getByRole("button", { name: "Add your first node" }).click();
  await search.fill("miner mk.1");
  await page.getByRole("option", { name: /^Miner Mk\.1.*10 recipes/ }).click();
  await page.getByRole("option", { name: "Iron Ore" }).click();
  await expect(page.getByRole("dialog", { name: "Add node" })).toBeHidden();
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.getByRole("button", { name: "Close node details" }).click();

  await canvas.hover({ position: { x: 640, y: 296 } });
  await page.mouse.down();
  await page.mouse.move(320, 296, { steps: 4 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Add node" }).click();
  await search.fill("iron ingot");
  await page
    .getByRole("option", { name: /^Iron Ingot.*Iron Ore.*Smelter/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Add node" })).toBeHidden();
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.getByRole("button", { name: "Close node details" }).click();

  await canvas.hover({ position: { x: 448, y: 360 } });
  await page.mouse.down();
  await page.mouse.move(512, 360, { steps: 4 });
  await page.mouse.up();
  await canvas.click({ position: { x: 480, y: 360 } });

  await expect(
    page.getByRole("complementary", {
      name: "Material Link details: Iron Ore",
    }),
  ).toBeVisible();
  await expect(page.getByText("30 items/min", { exact: true })).toBeVisible();
  await expect(page.getByText("Surplus", { exact: true })).toBeVisible();
  await expect(page.getByText("Iron Ore Extraction")).toBeVisible();
  await expect(page.getByText("Output · Iron Ore")).toBeVisible();
  await expect(page.getByText("Input · Iron Ore")).toBeVisible();
  await expect(page.getByText("Desc_OreIron_C")).toBeHidden();
  await page
    .getByRole("button", { name: "Close Material Link details" })
    .click();

  await canvas.click({ position: { x: 480, y: 360 } });
  await expect(
    page.getByRole("complementary", {
      name: "Material Link details: Iron Ore",
    }),
  ).toBeVisible();
  await canvas.hover({ position: { x: 512, y: 360 } });
  await page.mouse.down();
  await page.mouse.move(640, 500, { steps: 4 });
  await page.mouse.up();
  await expect(
    page.getByRole("dialog", { name: "Add compatible node" }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: /^Iron Ingot.*Iron Ore.*Smelter/ }),
  ).toBeVisible();
  await page
    .getByRole("option", { name: /^Iron Ingot.*Iron Ore.*Smelter/ })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Add compatible node" }),
  ).toBeHidden();

  await page.getByRole("button", { name: "Open canvas menu" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Export JSON", { exact: true }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).not.toBeNull();
  const document = JSON.parse(await readFile(path!, "utf8"));
  expect(document.nodes).toHaveLength(3);
  expect(document.materialLinks).toEqual([
    expect.objectContaining({
      from: expect.objectContaining({ portId: "output:Desc_OreIron_C" }),
      to: expect.objectContaining({ portId: "input:Desc_OreIron_C" }),
    }),
  ]);
});

test("shows inferred flow through a terminal Splitter", async ({ page }) => {
  await page.goto("/");
  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  const search = page.getByPlaceholder("Search buildings or recipes...");

  await page.getByRole("button", { name: "Add your first node" }).click();
  await search.fill("iron ingot");
  await page
    .getByRole("option", { name: /^Iron Ingot.*Iron Ore.*Smelter/ })
    .click();
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.getByRole("button", { name: "Close node details" }).click();

  await canvas.hover({ position: { x: 640, y: 296 } });
  await page.mouse.down();
  await page.mouse.move(320, 296, { steps: 4 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Splitter" }).click();
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.getByRole("button", { name: "Close node details" }).click();

  await canvas.hover({ position: { x: 448, y: 360 } });
  await page.mouse.down();
  await page.mouse.move(544, 392, { steps: 4 });
  await page.mouse.up();
  await canvas.click({ position: { x: 496, y: 376 } });

  await expect(
    page.getByRole("complementary", {
      name: "Material Link details: Iron Ingot",
    }),
  ).toBeVisible();
  await expect(page.getByText("30 items/min", { exact: true })).toBeVisible();
});

test("offers only compatible recipes after a connection is dropped on empty space", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  const search = page.getByPlaceholder("Search buildings or recipes...");

  await page.getByRole("button", { name: "Add your first node" }).click();
  await search.fill("miner mk.1");
  await page.getByRole("option", { name: /^Miner Mk\.1.*10 recipes/ }).click();
  await page.getByRole("option", { name: "Iron Ore" }).click();
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.getByRole("button", { name: "Close node details" }).click();

  await canvas.hover({ position: { x: 768, y: 360 } });
  await page.mouse.down();
  await page.mouse.move(900, 450, { steps: 4 });
  await page.mouse.up();

  await expect(
    page.getByRole("dialog", { name: "Add compatible node" }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: /^Iron Ingot.*Iron Ore.*Smelter/ }),
  ).toBeVisible();
  await expect(page.getByText("Production", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Conveyor Splitter" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel adding node" }).click();
  await expect(
    page.getByRole("dialog", { name: "Add compatible node" }),
  ).toBeHidden();

  await canvas.hover({ position: { x: 768, y: 360 } });
  await page.mouse.down();
  await page.mouse.move(900, 450, { steps: 4 });
  await page.mouse.up();

  await search.fill("iron plate");
  await expect(
    page.getByRole("option", {
      name: /^Iron Plate.*Iron Ingot.*Constructor/,
    }),
  ).toBeHidden();
  await search.fill("iron ingot");
  await page
    .getByRole("option", { name: /^Iron Ingot.*Iron Ore.*Smelter/ })
    .click();

  await expect(
    page.getByRole("dialog", { name: "Add compatible node" }),
  ).toBeHidden();
});

test("keeps recipe search usable in a compact mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 500, width: 412 });
  await page.goto("/");
  await page.getByRole("button", { name: "Add your first node" }).click();

  const nodePicker = page.getByRole("dialog", { name: "Add node" });
  const search = page.getByPlaceholder("Search buildings or recipes...");
  await expect(nodePicker).toBeVisible();
  await expect(search).not.toBeFocused();

  const bounds = await nodePicker.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(500);

  await search.fill("screws");
  await expect(page.getByRole("option").first()).toHaveAccessibleName(
    /^Screws/,
  );
  await page
    .getByRole("button", { name: "Show Screws recipes" })
    .first()
    .click();
  await expect(page.getByText("Screws Recipes")).toBeVisible();
});

test("opens and cancels compatible-node search from a mobile touch drag", async ({
  page,
}) => {
  await page.setViewportSize({ height: 932, width: 430 });
  await page.goto("/");
  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  const picker = page.getByRole("dialog", { name: "Add compatible node" });

  await page.getByRole("button", { name: "Add your first node" }).click();
  await page
    .getByPlaceholder("Search buildings or recipes...")
    .fill("miner mk.1");
  await page.getByRole("option", { name: /^Miner Mk\.1.*10 recipes/ }).click();
  await page.getByRole("option", { name: "Iron Ore" }).click();
  await canvas.click({ position: { x: 215, y: 466 } });
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
    element.releasePointerCapture = () => undefined;
  });

  const touch = { isPrimary: true, pointerId: 7, pointerType: "touch" };
  await canvas.dispatchEvent("pointerdown", {
    ...touch,
    button: 0,
    buttons: 1,
    clientX: 343,
    clientY: 466,
  });
  await canvas.dispatchEvent("pointermove", {
    ...touch,
    button: 0,
    buttons: 1,
    clientX: 300,
    clientY: 620,
  });
  await canvas.dispatchEvent("pointerup", {
    ...touch,
    button: 0,
    buttons: 0,
    clientX: 300,
    clientY: 620,
  });

  await expect(picker).toBeVisible();
  await expect(
    page.getByRole("option", { name: /^Iron Ingot.*Iron Ore.*Smelter/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel adding node" }).click();
  await expect(picker).toBeHidden();
});

test("navigates recipe-search layers with horizontal arrows", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add node" }).click();
  const search = page.getByPlaceholder("Search buildings or recipes...");
  await expect(search).toBeFocused();
  await search.fill("constructor");
  await expect(search).toHaveAttribute(
    "aria-activedescendant",
    /machine-Build_ConstructorMk1_C/,
  );

  await page.keyboard.press("ArrowRight");
  const recipeSearch = page.getByPlaceholder("Search Constructor recipes...");
  await expect(recipeSearch).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("constructor");
});

test("keeps the canvas and floating controls aligned to a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ height: 500, width: 320 });
  await page.goto("/");

  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  const menu = page.getByRole("button", { name: "Open canvas menu" });
  const controls = page.getByRole("toolbar", { name: "Canvas controls" });
  const buildTools = page.getByRole("toolbar", { name: "Build tools" });
  await expect(canvas).toBeVisible();

  await page.setViewportSize({ height: 915, width: 412 });

  await expect(menu).toBeInViewport();
  await expect(controls).toBeInViewport();
  await expect(buildTools).toBeInViewport();
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) => {
        const bounds = element.getBoundingClientRect();
        const resolution = Math.min(window.devicePixelRatio, 2);
        return {
          backingHeight: element.height,
          backingWidth: element.width,
          expectedHeight: Math.round(bounds.height * resolution),
          expectedWidth: Math.round(bounds.width * resolution),
          height: bounds.height,
          width: bounds.width,
        };
      }),
    )
    .toEqual({
      backingHeight: 915,
      backingWidth: 412,
      expectedHeight: 915,
      expectedWidth: 412,
      height: 915,
      width: 412,
    });
});

test("routes an empty-canvas long press only to the node picker", async ({
  page,
}) => {
  await page.setViewportSize({ height: 915, width: 412 });
  await page.goto("/");

  const canvas = page.getByRole("application", { name: "Infinite canvas" });
  await canvas.evaluate((element) => {
    const touch = new Touch({
      clientX: 206,
      clientY: 458,
      identifier: 0,
      target: element,
    });
    element.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        changedTouches: [touch],
        targetTouches: [touch],
        touches: [touch],
      }),
    );
  });
  await page.waitForTimeout(600);
  await canvas.dispatchEvent("contextmenu", {
    button: 2,
    clientX: 206,
    clientY: 458,
  });

  await expect(page.getByRole("dialog", { name: "Add node" })).toBeVisible();
  await expect(page.getByText("Duplicate selection")).toBeHidden();
  await expect(page.getByText("Delete selection")).toBeHidden();
});
