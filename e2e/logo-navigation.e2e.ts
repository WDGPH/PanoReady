import path from "node:path";
import { expect, test } from "@playwright/test";

const sample = path.join(process.cwd(), "public/samples/stix-validation-demo.stix");

test("logo protects active work before returning home", async ({ page }) => {
  await page.goto("./");
  await page.locator("#xml-upload").setInputFiles(sample);
  await page.getByRole("button", { name: "Validate & Fix", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "File assessment" })).toBeVisible();

  const homeButton = page.getByRole("button", { name: "Return to PanoReady home" });
  await homeButton.click();
  const dialog = page.getByRole("dialog", { name: "Start over?" });
  await expect(dialog).toContainText("abandon the current file");
  await expect(dialog.getByRole("button", { name: "Keep working" })).toBeFocused();
  await expect(dialog.getByRole("button")).toHaveCount(3);
  await expect(dialog.getByRole("button", { name: "Close start over prompt" })).toBeVisible();
  await dialog.getByRole("button", { name: "Keep working" }).click();
  await expect(homeButton).toBeFocused();

  await expect(page.getByRole("button", { name: "Save progress", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Automatic fixes", exact: true }).click();
  const firstFix = page.getByRole("checkbox", { name: /^Select fix for/ }).first();
  await firstFix.check();
  await page.getByRole("button", { name: "Save progress", exact: true }).click();
  const saveDialog = page.getByRole("dialog", { name: "Apply fixes before saving" });
  await expect(saveDialog).toContainText("1 unapplied fix");
  await expect(saveDialog.getByRole("button", { name: "Go back and apply fixes" })).toBeFocused();
  await expect(saveDialog.getByRole("button", { name: "Close save progress prompt" })).toBeVisible();
  await saveDialog.getByRole("button", { name: "Go back and apply fixes" }).click();
  await expect(firstFix).toBeChecked();
  await expect(page.getByRole("button", { name: "Save progress", exact: true })).toBeFocused();

  await homeButton.click();
  await dialog.getByRole("button", { name: "Start over", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Better data in/ })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
