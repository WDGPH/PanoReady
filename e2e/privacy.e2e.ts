import { expect, test, type Page } from "@playwright/test";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import { readFile } from "node:fs/promises";
import { expectNoPersistentState, installGuard, markers, persistentState } from "./privacy-guard";

// Entirely synthetic; the invalid grade and phone exercise both correction paths.
const xml = `<?xml version="1.0"?>
<SchoolUpload xmlns="http://ontario.ca">
  <Metadata><CreateDate>2026-09-12</CreateDate><CreateTime>12:00:00</CreateTime>
    <CreatedBy>Test</CreatedBy><ContactPhone type="WORK">519-555-1234</ContactPhone>
    <ContactEmail>test@example.invalid</ContactEmail><FullUpload>YES</FullUpload></Metadata>
  <School><SchoolNumber>123</SchoolNumber><Name>Test school</Name><Students><Student>
    <OEN>123456789</OEN><Grade>BAD</Grade><Name><First>${markers.record}</First><Last>Student</Last></Name>
    <Gender>F</Gender><BirthDate>2015-04-13</BirthDate>
    <Address><StreetNumber>12</StreetNumber><StreetName>Main</StreetName><StreetType>ST</StreetType>
      <City>Guelph</City><Province>ON</Province><PostalCode>N1G1A1</PostalCode></Address>
    <Phone type="HOME">(519) 555-1234</Phone>
  </Student></Students></School>
</SchoolUpload>`;

async function download(page: Page, action: () => Promise<void>) {
  const pending = page.waitForEvent("download");
  await action();
  const result = await pending;
  const file = await result.path();
  if (!file) throw new Error("Download did not complete");
  return { name: result.suggestedFilename(), bytes: await readFile(file) };
}

test("validation, corrections and encrypted output keep records and passwords local", async ({ context, page }) => {
  const guard = await installGuard(context, page);
  await page.goto("./");
  await page.locator("#xml-upload").setInputFiles({ name: markers.filename, mimeType: "application/xml", buffer: Buffer.from(xml) });
  await page.getByRole("button", { name: "Validate & Fix", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Import readiness" })).toBeVisible();
  await guard.assertPrivate();
  await page.getByRole("button", { name: "Automatic fixes", exact: true }).click();
  await page.getByLabel(`Select fix for ${markers.record} Student: Phone`, { exact: true }).check();
  await page.getByRole("button", { name: /Apply selected/ }).click();
  await page.getByRole("button", { name: "Manual fixes", exact: true }).click();
  await page.getByRole("row").filter({ hasText: markers.record }).filter({ hasText: "BAD" }).getByRole("textbox").fill("GR5");
  await page.getByRole("button", { name: "Apply fixes and view summary", exact: true }).click();
  await page.getByRole("button", { name: "Output", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Output", exact: true })).toBeVisible();
  const plain = await download(page, () => page.getByRole("button", { name: "Download", exact: true }).first().click());
  expect(plain.name).toMatch(/_validated\.xml$/);
  const text = plain.bytes.toString("utf8");
  expect(text).toContain(markers.record);
  expect(text).toContain(">GR5<");
  expect(text).toContain(">519-555-1234<");
  expect(text).not.toContain("(519) 555-1234");
  const report = await download(page, () => page.locator(".download-row").filter({ hasText: "_issue_report.csv" }).getByRole("button").click());
  expect(report.bytes.toString("utf8")).toContain(markers.record);

  await page.getByRole("button", { name: "Encrypt & ZIP" }).click();
  await page.getByPlaceholder("Password (8+ characters)").fill(markers.password);
  await page.getByPlaceholder("Confirm password").fill(markers.password);
  await guard.assertPrivate();
  const zip = await download(page, () => page.getByRole("button", { name: "Encrypt & download" }).click());
  const reader = new ZipReader(new BlobReader(new Blob([zip.bytes])));
  try {
    const entries = await reader.getEntries();
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.encrypted).toBe(true);
    if (entry.directory) throw new Error("Expected encrypted XML");
    await expect(entry.getData(new TextWriter(), { password: "wrong-password" })).rejects.toThrow();
    expect(await entry.getData(new TextWriter(), { password: markers.password })).toBe(text);
  } finally {
    await reader.close();
  }
  await guard.assertPrivate();
  await page.getByRole("button", { name: "Process another file" }).click();
  await expect(page.locator("#xml-upload")).toHaveValue("");
  await expect(page.getByText(markers.filename, { exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder("Password (8+ characters)")).toHaveCount(0);
  await guard.assertPrivate();
  await page.reload();
  await expect(page.locator("#xml-upload")).toHaveValue("");
  await guard.assertPrivate();
});

test("comparison decisions and review downloads remain local and reset with the pair", async ({ context, page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  const guard = await installGuard(context, page);
  await page.goto("./");
  await page.getByRole("button", { name: "Compare Files", exact: true }).click();
  const previous = xml.replace("<Grade>BAD</Grade>", "<Grade>GR5</Grade>");
  await page.locator("#xml-upload").setInputFiles({ name: markers.filename, mimeType: "application/xml", buffer: Buffer.from(previous) });
  await page.locator("#xml-upload-current").setInputFiles({ name: "current.xml", mimeType: "application/xml", buffer: Buffer.from(previous.replace("<Grade>GR5</Grade>", "<Grade>GR6</Grade>")) });
  await page.getByRole("button", { name: "Compare Files", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "STIX file comparison" })).toBeVisible();
  await page.getByRole("tab", { name: "Record details" }).click();
  await page.getByRole("row").filter({ hasText: markers.record }).getByRole("cell", { name: "Inspect →" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const report = await download(page, () => page.getByRole("button", { name: "Review log" }).click());
  expect(report.bytes.toString("utf8")).toContain(markers.record);
  expect(report.bytes.toString("utf8")).toContain("confirmed");
  await guard.assertPrivate();
  await page.getByRole("button", { name: "Compare another pair" }).click();
  await expect(page.locator("#xml-upload")).toHaveValue("");
  await expect(page.getByText(markers.record, { exact: false })).toHaveCount(0);
  await guard.assertPrivate();
  await page.reload();
  await expect(page.locator("#xml-upload")).toHaveValue("");
  await guard.assertPrivate();
});

test("negative controls detect attempted egress and persistent storage", async ({ context, page }) => {
  const guard = await installGuard(context, page);
  await page.goto("./");
  await expectNoPersistentState(context, page);
  for (const url of ["https://example.invalid/leak", "/PanoReady/not-an-artifact", `/PanoReady/?record=${markers.record}`]) {
    const before = guard.violations.length;
    await page.evaluate((target) => fetch(target).catch(() => undefined), url);
    await expect.poll(() => guard.violations.length).toBeGreaterThan(before);
  }
  const beforePost = guard.violations.length;
  await page.evaluate((marker) => fetch("/PanoReady/", { method: "POST", body: marker }).catch(() => undefined), markers.record);
  await expect.poll(() => guard.violations.length).toBeGreaterThan(beforePost);
  const beforeSocket = guard.violations.length;
  await page.evaluate(() => { new WebSocket("ws://127.0.0.1:4173/leak"); });
  await expect.poll(() => guard.violations.length).toBeGreaterThan(beforeSocket);
  await page.evaluate((marker) => localStorage.setItem("negative-control", marker), markers.record);
  await context.addCookies([{ name: "negative-control", value: markers.record, url: "http://127.0.0.1:4173", httpOnly: true }]);
  const state = await persistentState(context, page);
  expect(state.local).toHaveLength(1);
  expect(state.cookies).toHaveLength(1);
  await expect(expectNoPersistentState(context, page)).rejects.toThrow();
});
