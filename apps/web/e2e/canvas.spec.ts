import { expect, test } from "@playwright/test";

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
  await page.getByRole("option", { name: /Iron Plate Constructor/ }).click();
  await expect(nodePicker).toBeHidden();
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
