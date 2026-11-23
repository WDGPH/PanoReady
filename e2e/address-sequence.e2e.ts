import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const xml = `<SchoolUpload xmlns="http://ontario.ca"><Metadata><CreateDate>2026-09-12</CreateDate><CreateTime>12:00:00</CreateTime><CreatedBy>Synthetic Test</CreatedBy><ContactPhone type="WORK">204-555-0100</ContactPhone><ContactEmail>test@example.invalid</ContactEmail><FullUpload>YES</FullUpload></Metadata><School><SchoolNumber>123</SchoolNumber><Name>Synthetic School</Name><Students><Student><Name><First>Sample</First><Last>Student</Last></Name><Gender>F</Gender><BirthDate>2015-04-13</BirthDate><Address><StreetNumber>123 Main Street West</StreetNumber><City>Exampleville</City><Province>ON</Province></Address></Student></Students></School></SchoolUpload>`;

test("combined address preview stays accurate through filters, apply, download and Undo", async ({ page }) => {
  await page.goto("./");
  await page.locator("#xml-upload").setInputFiles({ name: "sequence.xml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  await page.getByRole("button", { name: "Validate & Fix", exact: true }).last().click();
  await page.getByRole("button", { name: "Automatic fixes", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Issue", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Correction", exact: true })).toHaveCount(0);
  const checkbox = page.getByRole("checkbox", { name: "Select fix for Student 1.1: StreetNumber", exact: true });
  const row = page.locator("tr[data-row-id]").filter({ has: checkbox });
  await expect(row).toContainText("Street number contains the street name. Street name contains the street type and direction.");
  const final = row.getByRole("table", { name: "Suggested field changes" }).first();
  await expect(final.getByRole("row", { name: "Street Name Main", exact: true })).toBeVisible();
  const toggle = row.getByRole("button", { name: "Repair steps for Student 1.1", exact: true });
  const originalHeight = (await row.boundingBox())!.height;
  await toggle.focus();
  await page.keyboard.press("Enter");
  const details = page.getByRole("region", { name: "Repair steps for Student 1.1", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(details).toBeVisible();
  await expect(details.getByRole("listitem")).toHaveCount(2);
  await expect(details.getByRole("table")).toHaveCount(0);
  await expect(row.getByRole("table", { name: "Suggested field changes" })).toHaveCount(1);
  expect((await row.boundingBox())!.height).toBeCloseTo(originalHeight, 0);
  expect((await details.boundingBox())!.width).toBeGreaterThan((await row.boundingBox())!.width * 0.95);
  await expect(checkbox).not.toBeChecked();
  await expect(details.getByRole("complementary")).toHaveCount(0);
  await expect(details).not.toContainText("Address checks pass");
  await checkbox.check();

  // Changing scope regenerates the sequence and clears the old selection.
  await page.getByRole("button", { name: "Filter severity: All severities" }).click();
  await page.getByRole("radio", { name: "Errors only", exact: true }).check();
  await expect(checkbox).not.toBeChecked();
  await expect(row).toContainText("Street number contains the street name.");
  await expect(row.getByRole("table").first()).toContainText("Main Street West");
  await expect(row).not.toContainText("Combined address repair");
  // A single atomic repair can change several fields; its table is sufficient.
  await expect(row.getByRole("table").getByRole("rowheader")).toHaveCount(2);
  await expect(toggle).toHaveCount(0);
  await expect(details).toHaveCount(0);
  await expect(row).toContainText("1 address issue remains after this correction.");
  await page.getByRole("button", { name: "Filter severity: Errors only" }).click();
  await page.getByRole("radio", { name: "All severities", exact: true }).check();
  await expect(row).toContainText("Street number contains the street name. Street name contains the street type and direction.");
  await checkbox.check();
  await page.getByRole("button", { name: "Apply selected (1)", exact: true }).click();
  await expect(checkbox).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manual fixes", exact: true })).toBeEnabled();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save progress", exact: true }).click();
  const output = readFileSync((await (await downloading).path())!, "utf8");
  expect(output).toMatch(/<[^>]*StreetNumber>123<\//);
  expect(output).toMatch(/<[^>]*StreetName>Main<\//);
  expect(output).toMatch(/<[^>]*StreetType>ST<\//);
  expect(output).toMatch(/<[^>]*StreetDirection>W<\//);
  expect(output).not.toContain("Main Street West");

  await page.getByRole("button", { name: /^History \(/ }).click();
  const history = page.getByRole("dialog", { name: /^History/ });
  await expect(history).toContainText("Automatic fixes (1 correction, 4 field changes)");
  await history.getByRole("button", { name: "Undo last action" }).click();
  await page.keyboard.press("Escape");
  await expect(row).toContainText("Street number contains the street name. Street name contains the street type and direction.");
  await expect(checkbox).not.toBeChecked();
});


test("expanded repair steps stay with the correct record through sorting and paging", async ({ page }) => {
  const student = xml.match(/<Student>[\s\S]*?<\/Student>/)![0];
  const students = Array.from({ length: 30 }, (_, index) => student.replace("123 Main", `${100 + index} Main`)).join("");
  await page.goto("./");
  await page.locator("#xml-upload").setInputFiles({ name: "paged-sequences.xml", mimeType: "application/xml", buffer: Buffer.from(xml.replace(student, students)) });
  await page.getByRole("button", { name: "Validate & Fix", exact: true }).last().click();
  await page.getByRole("button", { name: "Automatic fixes", exact: true }).click();
  const toggle = page.getByRole("button", { name: "Repair steps for Student 1.1", exact: true });
  const details = page.getByRole("region", { name: "Repair steps for Student 1.1", exact: true });
  await toggle.click();
  await expect(details).toContainText("Set street number to 100");
  await expect(page.getByRole("button", { name: "Select all on current page (25)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select all across all pages (30)", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await page.getByRole("button", { name: "Record", exact: true }).click();
  await expect(details).toHaveCount(0);
  const paging = page.getByRole("navigation", { name: "Table pages" });
  await paging.getByRole("button", { name: "Next", exact: true }).click();
  await expect(details).toBeVisible();
  await expect(details).toContainText("Set street number to 100");
  await expect(page.getByRole("button", { name: "Select all on current page (5)", exact: true })).toBeVisible();
  const parent = page.locator(".autofix-row").filter({ has: toggle });
  await expect(parent.locator("xpath=following-sibling::tr[1]")).toContainText("Separate the street number and name");
  await toggle.click();
  await expect(details).toHaveCount(0);
  await expect(toggle).toBeFocused();
});
