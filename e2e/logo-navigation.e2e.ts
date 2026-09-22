import path from "node:path";
import { expect, test } from "@playwright/test";

const sample = path.join(process.cwd(), "public/samples/stix-validation-demo.stix");

test("logo clears files selected on the landing page", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Compare Files", exact: true }).first().click();
  await page.locator("#xml-upload").setInputFiles(sample);
  await page.locator("#xml-upload-current").setInputFiles(sample);
  await expect(page.getByText("stix-validation-demo.stix", { exact: true })).toHaveCount(2);

  await page.getByRole("button", { name: "Return to PanoReady home" }).click();

  expect(await page.locator("#xml-upload").evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
  await expect(page.locator("#xml-upload-current")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Validate & Fix", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
});

test("logo protects active work before returning home", async ({ page }) => {
  await page.goto("./");
  await page.locator("#xml-upload").setInputFiles(sample);
  await page.getByRole("button", { name: "Validate & Fix", exact: true }).last().click();
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
  const backButton = page.getByRole("button", { name: "Back", exact: true });
  await backButton.click();
  await expect(dialog).toContainText("abandon the current file");
  await dialog.getByRole("button", { name: "Keep working" }).click();
  await expect(backButton).toBeFocused();

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

test("logo protects an active comparison before returning home", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Compare Files", exact: true }).first().click();
  await page.locator("#xml-upload").setInputFiles(sample);
  await page.locator("#xml-upload-current").setInputFiles(sample);
  await page.getByRole("button", { name: "Compare Files", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "STIX file comparison" })).toBeVisible();

  const homeButton = page.getByRole("button", { name: "Return to PanoReady home" });
  await homeButton.click();
  const dialog = page.getByRole("dialog", { name: "Start over?" });
  await expect(dialog).toContainText("abandon the current file");
  await dialog.getByRole("button", { name: "Keep working" }).click();
  await expect(homeButton).toBeFocused();
  await expect(page.getByRole("heading", { name: "STIX file comparison" })).toBeVisible();

  await homeButton.click();
  await dialog.getByRole("button", { name: "Start over", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Better data in/ })).toBeVisible();
});
