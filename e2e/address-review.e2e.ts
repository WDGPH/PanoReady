import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Repeat a synthetic record with two address findings to exercise class-specific
// navigation beyond the table's 25-row page without entering unrelated findings.
const sample = readFileSync("public/samples/stix-validation-demo.stix", "utf8");
const student = sample.match(/<ns1:Student>[\s\S]*?<\/ns1:Student>/g)![1];
const xml = sample.replace(/<ns1:Students>[\s\S]*?<\/ns1:Students>/, `<ns1:Students>${student.repeat(30)}</ns1:Students>`);

test("address reviews navigate between students and retain drafts", async ({ page }) => {
  await page.goto("./");
  await page.locator("#xml-upload").setInputFiles({ name: "address-review.xml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await page.getByRole("button", { name: "Validate & Fix", exact: true }).last().click();
  await page.getByRole("button", { name: "Automatic fixes", exact: true }).click();
  await page.getByRole("button", { name: "Manual fixes", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Review address for Student 1.1", exact: true }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const footer = dialog.locator("footer");
  await expect(dialog).toContainText("Address 1 of 30");
  await expect(footer.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  const street = dialog.getByRole("textbox", { name: /^Street number/i });
  const originalStreet = await street.inputValue();
  await expect(dialog.getByRole("button", { name: "Back to fixes", exact: true })).toHaveCount(1);
  await expect(dialog.getByText("Reset suggestion", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("school0:student0", { exact: true })).toHaveCount(0);
  await street.fill("42");
  await expect(footer.getByRole("button", { name: "1 field change staged — back to fixes", exact: true })).toBeVisible();
  await page.keyboard.press("Alt+PageDown");
  await expect(dialog.getByRole("heading", { name: "Student 1.2", exact: true })).toBeVisible();
  await expect(dialog).toContainText("Address 2 of 30");
  await expect(dialog.locator("summary:focus")).toContainText("Address");
  await street.fill("84");
  await page.keyboard.press("PageDown");
  await expect(dialog).toContainText("Address 2 of 30");
  await page.keyboard.press("Alt+PageUp");
  await expect(street).toHaveValue("42");
  await footer.getByRole("button", { name: "Reset changes", exact: true }).click();
  await expect(street).toHaveValue(originalStreet);
  await expect(dialog.getByRole("checkbox", { name: "Apply", exact: true })).toHaveCount(0);
  await expect(footer.getByRole("button", { name: "Back to fixes", exact: true })).toBeVisible();
  await page.keyboard.press("Alt+PageDown");
  await expect(street).toHaveValue("84");
  await page.keyboard.press("Alt+PageUp");
  await street.fill("42");
  await footer.getByRole("button", { name: "1 field change staged — back to fixes", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(street).toHaveValue("42");
  for (let i = 1; i < 30; i++) await footer.getByRole("button", { name: "Next address", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Student 1.30", exact: true })).toBeVisible();
  await expect(dialog).toContainText("Address 30 of 30");
  await page.keyboard.press("Alt+PageDown");
  await expect(dialog).toContainText("Address 30 of 30");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

for (const apply of [false, true]) test(`safe suggestions stay on automatic fixes (apply: ${apply})`, async ({ page }) => {
  const safeStudent = student.replace(/<ns1:Address>[\s\S]*?<\/ns1:Address>/, "<ns1:Address><ns1:StreetNumber>51 Keats</ns1:StreetNumber><ns1:City>Guelph</ns1:City><ns1:Province>ON</ns1:Province></ns1:Address>");
  const conflictStudent = student.replace(/<ns1:Address>[\s\S]*?<\/ns1:Address>/, "<ns1:Address><ns1:StreetNumber>66 Downey</ns1:StreetNumber><ns1:StreetName>Rd</ns1:StreetName><ns1:City>Guelph</ns1:City><ns1:Province>ON</ns1:Province></ns1:Address>");
  const fixture = sample.replace(/<ns1:Students>[\s\S]*?<\/ns1:Students>/, `<ns1:Students>${safeStudent}${conflictStudent}</ns1:Students>`);
  await page.goto("./");
  await page.locator("#xml-upload").setInputFiles({ name: "suggestions.xml", mimeType: "application/xml", buffer: Buffer.from(fixture) });
  await page.getByRole("button", { name: "Validate & Fix", exact: true }).last().click();
  await page.getByRole("button", { name: "Automatic fixes", exact: true }).click();
  const safeFix = page.getByRole("checkbox", { name: "Select fix for Student 1.1: StreetNumber", exact: true });
  await expect(safeFix).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select fix for Student 1.2: StreetNumber", exact: true })).toHaveCount(0);
  await safeFix.check();
  if (apply) {
    await page.getByRole("button", { name: /Apply selected/ }).click();
    await expect(safeFix).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Manual fixes", exact: true }).click();
  if (!apply) {
    await page.getByRole("button", { name: "Review address for Student 1.1", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("textbox", { name: /^Street number/i })).toHaveValue("51 Keats");
    await expect(page.getByRole("dialog").getByRole("textbox", { name: /^Street name/i })).toHaveValue("");
    await expect(page.getByRole("dialog").getByRole("button", { name: "Back to fixes", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    await page.getByRole("button", { name: "View student 1.1", exact: true }).first().click();
    const addressSection = page.getByRole("dialog").locator("details").filter({ has: page.getByRole("heading", { name: "Address", exact: true }) });
    await addressSection.locator("summary").click();
    await expect(addressSection.getByText("51", { exact: true })).toBeVisible();
    await expect(addressSection.getByText("Keats", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Review address for Student 1.2", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const street = dialog.getByRole("textbox", { name: /^Street number/i });
  await expect(street).toHaveValue("66 Downey");
  await expect(dialog.getByRole("textbox", { name: /^Street name/i })).toHaveValue("Rd");
  await expect(dialog.getByRole("button", { name: "Back to fixes", exact: true })).toBeVisible();
  await street.fill("66");
  await dialog.getByRole("button", { name: "Reset changes", exact: true }).click();
  await expect(street).toHaveValue("66 Downey");
  await dialog.getByRole("textbox", { name: /^City/i }).fill("Waterloo");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Apply fixes and view summary", exact: true }).click();
  await page.getByRole("button", { name: "Output", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download", exact: true }).first().click();
  const file = await (await downloading).path();
  const output = readFileSync(file!, "utf8");
  expect(output).toContain(">66 Downey<");
  expect(output).toContain(">Rd<");
  expect(output).toContain(">Waterloo<");
  if (!apply) expect(output).toContain(">51 Keats<");
});
