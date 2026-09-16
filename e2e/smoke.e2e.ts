import { expect, test } from "@playwright/test";

test("production export loads under the GitHub Pages base path", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /Better data in/ })).toBeVisible();
  await expect(page.locator("#xml-upload")).toBeAttached();
  await expect(page.getByRole("button", { name: "Compare Files", exact: true })).toBeVisible();
});
