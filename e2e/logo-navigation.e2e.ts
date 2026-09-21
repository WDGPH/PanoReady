import path from "node:path";
import { expect, test } from "@playwright/test";

const sample = path.join(process.cwd(), "public/samples/stix-validation-demo.stix");

test("logo protects active work and can save before returning home", async ({ page }) => {
  await page.goto("./");
  await page.locator("#xml-upload").setInputFiles(sample);
  await page.getByRole("button", { name: "Validate & Fix", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "File assessment" })).toBeVisible();

  const homeButton = page.getByRole("button", { name: "Return to PanoReady home" });
  await homeButton.click();
  const dialog = page.getByRole("dialog", { name: "Start over?" });
  await expect(dialog).toContainText("abandon the current file");
  await expect(dialog.getByRole("button", { name: "Save progress and start over" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Keep working" }).click();
  await expect(homeButton).toBeFocused();

  await expect(page.getByRole("button", { name: "Save progress", exact: true })).toBeVisible();
  await homeButton.click();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save progress and start over" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("stix-validation-demo_in_progress.xml");
  await expect(page.getByRole("heading", { name: /Better data in/ })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
