import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";
import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const origin = "http://127.0.0.1:4173";
const markers = {
  record: "SYNTH_RECORD_Q7X9",
  filename: "SYNTH_FILENAME_R4T8.xml",
  previousSource: "SYNTH_PREVIOUS_SOURCE_J8D4",
  currentSource: "SYNTH_CURRENT_SOURCE_B5H7",
  comparisonReviewer: "SYNTH_COMPARISON_REVIEWER_N9F2",
  decisionReviewer: "SYNTH_DECISION_REVIEWER_T6K3",
  password: "SYNTH_PASSWORD_C8N4",
};

function requestViolation(request: Request): string | null {
  const url = new URL(request.url());
  const body = request.postData() ?? "";
  const headerText = JSON.stringify(request.headers());
  if (url.origin !== origin || !url.pathname.startsWith("/PanoReady/")) return `unexpected destination ${request.url()}`;
  if (!["GET", "HEAD"].includes(request.method())) return `unexpected method ${request.method()} ${request.url()}`;
  if (url.search || url.hash) return `unexpected URL parameters ${request.url()}`;
  if (body) return `unexpected request body ${request.url()}`;
  const relative = decodeURIComponent(url.pathname.slice("/PanoReady/".length));
  if (relative.split("/").some((part) => part === "..") || relative.includes("\\")) return `unsafe artifact path ${request.url()}`;
  const artifact = path.join(process.cwd(), "out", relative || "index.html");
  if (!existsSync(artifact) || !statSync(artifact).isFile()) return `request is not a built artifact ${request.url()}`;
  const observed = `${request.url()}\n${body}\n${headerText}`;
  for (const marker of Object.values(markers)) if (observed.includes(marker)) return `marker in request: ${marker}`;
  return null;
}

async function installGuard(context: BrowserContext, page: Page) {
  const violations: string[] = [];
  const logs: string[] = [];
  const navigations: string[] = [];
  context.on("request", (request) => {
    const violation = requestViolation(request);
    if (violation) violations.push(violation);
  });
  const observePage = (candidate: Page) => {
    candidate.on("websocket", (socket) => violations.push(`websocket ${socket.url()}`));
    candidate.on("console", (message) => logs.push(message.text()));
    candidate.on("pageerror", (error) => logs.push(error.message));
    candidate.on("framenavigated", (frame) => { if (frame === candidate.mainFrame()) navigations.push(frame.url()); });
  };
  observePage(page);
  context.on("page", (candidate) => { if (candidate !== page) observePage(candidate); });
  await context.route("**/*", async (route) => {
    const violation = requestViolation(route.request());
    if (violation) await route.abort("blockedbyclient");
    else await route.continue();
  });
  return { violations, logs, navigations };
}

async function downloadedText(page: Page, action: () => Promise<void>): Promise<{ name: string; text: string }> {
  const pending = page.waitForEvent("download");
  await action();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error("Browser did not expose the completed download.");
  return { name: download.suggestedFilename(), text: await readFile(path, "utf8") };
}

async function dropFile(page: Page, target: ReturnType<Page["locator"]>, name: string, contents: Buffer) {
  const dataTransfer = await page.evaluateHandle(({ fileName, base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], fileName, { type: "application/xml" }));
    return transfer;
  }, { fileName: name, base64: contents.toString("base64") });
  await target.dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();
}

function ambiguousWorkbook(): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Child First Name", "Surname", "DOB", "Sex", "Grade"],
    [markers.record, "Workbook", "03/04/2015", "F", "GR5"],
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-09-12"], ["Time Created", "12:00:00"],
    ["Created By", "Workbook exporter"], ["Contact Phone", "519-555-1234"], ["Phone Type", "WORK"],
    ["PHU Contact Email", "test@example.invalid"], ["Full Upload", "YES"],
    ["School Number", "123"], ["School Name", "Test school"],
  ]), "File Info");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsm" }));
}

async function persistentState(context: BrowserContext, page: Page) {
  const browserState = await page.evaluate(async () => {
    const local = Object.entries(localStorage);
    const session = Object.entries(sessionStorage);
    const databases = "databases" in indexedDB ? await indexedDB.databases() : [];
    const databaseNames = databases.map((database) => database.name ?? "(unnamed)");
    const cacheNames = "caches" in window ? await caches.keys() : [];
    return { local, session, databaseNames, cacheNames };
  });
  return { ...browserState, cookies: await context.cookies() };
}

async function expectNoPersistentState(context: BrowserContext, page: Page) {
  expect(await persistentState(context, page)).toEqual({ local: [], session: [], databaseNames: [], cacheNames: [], cookies: [] });
}

const xml = `<?xml version="1.0"?><SchoolUpload xmlns="http://ontario.ca"><Metadata><CreateDate>2026-09-12</CreateDate><CreateTime>12:00:00</CreateTime><CreatedBy>Test</CreatedBy><ContactPhone type="WORK">519-555-1234</ContactPhone><ContactEmail>test@example.invalid</ContactEmail><FullUpload>YES</FullUpload></Metadata><School><SchoolNumber>123</SchoolNumber><Name>Test school</Name><Students><Student><OEN>123456789</OEN><Grade>BAD</Grade><Name><First>${markers.record}</First><Last>Student</Last></Name><Gender>F</Gender><BirthDate>2015-04-13</BirthDate><Address><StreetNumber>12</StreetNumber><StreetName>Main</StreetName><StreetType>ST</StreetType><City>Guelph</City><Province>ON</Province><PostalCode>N1G 1A1</PostalCode></Address><Phone type="HOME">(519) 555-1234</Phone></Student></Students></School></SchoolUpload>`;
const comparisonCurrent = xml.replace("<Grade>BAD</Grade>", "<Grade>GR6</Grade>").replace("(519) 555-1234", "519-555-1234");
const comparisonPrevious = comparisonCurrent.replace("<Grade>GR6</Grade>", "<Grade>GR5</Grade>");

test("production static workflow stays local and releases session data on reset", async ({ browser, context, page }) => {
  test.setTimeout(180_000);
  const observed = await installGuard(context, page);
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /Better data in/ })).toBeVisible();
  await page.locator("#xml-upload").setInputFiles({ name: markers.filename, mimeType: "application/xml", buffer: Buffer.from(xml) });
  await page.getByRole("button", { name: "Validate & Fix" }).last().click();
  await expect(page.getByRole("heading", { name: "Quality assessment" })).toBeVisible();
  await expect(page.getByRole("region", { name: "By issue type" })).toBeVisible();
  await page.getByRole("button", { name: "By school", exact: true }).click();
  await expect(page.getByRole("region", { name: "By school" })).toBeVisible();
  await page.getByRole("button", { name: "Automatic fixes" }).click();
  await expect(page.getByRole("heading", { name: "Choose automatic fixes" })).toBeVisible();
  await page.getByRole("button", { name: /Apply all pages/ }).click();
  await expect(page.getByText(/Undo last action/)).toBeVisible();
  await page.getByRole("button", { name: "Applied", exact: true }).click();
  await expect(page.getByText("519-555-1234", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Undo last action/ }).click();
  await page.getByRole("button", { name: "Remaining", exact: true }).click();
  await expect(page.getByText("(519) 555-1234", { exact: true }).first()).toBeVisible();
  const phoneFix = page.getByLabel(`Select fix for ${markers.record} Student: Phone`);
  await expect(phoneFix).toBeVisible();
  await phoneFix.click();
  await page.getByRole("button", { name: /Apply selected/ }).click();
  await expect(page.getByRole("region", { name: "Applied fixes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Applied", exact: true }).click();
  await expect(page.getByRole("region", { name: "Applied fixes" })).toContainText("Applied 1 automatic fix");
  await page.getByRole("button", { name: "Return to Quality assessment" }).first().click();
  await page.getByRole("button", { name: "Automatic fixes" }).click();
  await page.getByRole("button", { name: "Manual fixes" }).click();
  await page.getByLabel(`Correct Grade for ${markers.record} Student`).fill("GR5");
  await page.getByRole("button", { name: /Apply selected/ }).click();
  await page.getByRole("button", { name: "View summary" }).click();
  await expect(page.getByRole("heading", { name: "Summary and Output" })).toBeVisible();
  const plain = await downloadedText(page, () => page.getByRole("button", { name: "Download", exact: true }).first().click());
  expect(plain.name).toMatch(/_checked\.xml$/);
  expect(plain.text).toContain(`\n  <ns1:Metadata>`);
  expect(plain.text).toContain(markers.record);
  expect(plain.text).toContain("<ns1:Phone type=\"HOME\">519-555-1234</ns1:Phone>");
  expect(plain.text).not.toContain("(519) 555-1234");

  const report = page.waitForEvent("download");
  await page.locator(".download-row").filter({ hasText: "_review_report.xlsx" }).getByRole("button", { name: "Excel", exact: true }).click();
  const reportDownload = await report;
  expect(reportDownload.suggestedFilename()).toContain("_review_report.xlsx");
  const reportPath = await reportDownload.path();
  if (!reportPath) throw new Error("Review report download was unavailable.");
  const reportWorkbook = XLSX.read(await readFile(reportPath), { type: "buffer" });
  const overview = XLSX.utils.sheet_to_json<unknown[]>(reportWorkbook.Sheets.Overview, { header: 1, raw: false });
  const changes = XLSX.utils.sheet_to_json<Record<string, string>>(reportWorkbook.Sheets.Changes, { raw: false });
  expect(overview.flat()).not.toContain("Source system");
  expect(overview.flat()).not.toContain("Current reviewer");
  expect(overview.flat()).toContain("STIX XML");
  expect(overview.flat()).toContain("Test");
  expect(changes.every((row) => !("Reviewer" in row))).toBe(true);
  expect(changes.some((row) => row.Record === "school0:student0" && row.NewValue === "519-555-1234")).toBe(true);
  expect(changes.some((row) => row.Record === "school0:student0" && row.Field === "Grade" && row.NewValue === "GR5")).toBe(true);

  await page.getByRole("button", { name: /Encrypt & ZIP/ }).click();
  await page.getByPlaceholder("Password (8+ characters)").fill(markers.password);
  await page.getByPlaceholder("Confirm password").fill(markers.password);
  const zipPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Encrypt & download" }).click();
  const zipDownload = await zipPending;
  const zipPath = await zipDownload.path();
  if (!zipPath) throw new Error("Encrypted ZIP download was unavailable.");
  const reader = new ZipReader(new BlobReader(new Blob([await readFile(zipPath)])));
  const entries = await reader.getEntries();
  expect(entries).toHaveLength(1);
  expect(entries[0].encrypted).toBe(true);
  const zippedXml = entries[0].directory ? "" : await entries[0].getData(new TextWriter(), { password: markers.password });
  await reader.close();
  expect(zippedXml).toBe(plain.text);

  const savedPending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save in-progress file" }).click();
  const savedDownload = await savedPending;
  expect(savedDownload.suggestedFilename()).toMatch(/_in_progress\.xml$/);
  const savedPath = await savedDownload.path();
  if (!savedPath) throw new Error("STIX progress download was unavailable.");
  const savedXml = await readFile(savedPath, "utf8");
  expect(savedXml).toContain('<ns1:Grade>GR5</ns1:Grade>');
  expect(savedXml).toContain('<ns1:Phone type="HOME">519-555-1234</ns1:Phone>');

  const freshContext = await browser.newContext({ baseURL: `${origin}/PanoReady/`, serviceWorkers: "block" });
  const freshPage = await freshContext.newPage();
  const freshObserved = await installGuard(freshContext, freshPage);
  await freshPage.goto("./");
  await expect(freshPage.getByRole("region", { name: "Resume saved work" })).toHaveCount(0);
  await freshPage.locator("#xml-upload").setInputFiles({ name: "progress.xml", mimeType: "application/xml", buffer: Buffer.from(savedXml) });
  await freshPage.getByRole("button", { name: "Validate & Fix" }).last().click();
  await expect(freshPage.getByRole("heading", { name: "Quality assessment" })).toBeVisible();
  await expect(freshPage.getByRole("button", { name: /Undo last action/ })).toHaveCount(0);
  await expectNoPersistentState(freshContext, freshPage);
  expect(freshObserved.violations).toEqual([]);
  await freshContext.close();

  await expectNoPersistentState(context, page);
  await page.getByRole("button", { name: "Process another file" }).click();
  await expect(page.locator("#xml-upload")).toHaveValue("");
  await expect(page.getByText(markers.filename)).toHaveCount(0);
  await expect(page.getByPlaceholder("Password (8+ characters)")).toHaveCount(0);
  await expectNoPersistentState(context, page);
  await page.reload();
  await expectNoPersistentState(context, page);

  await page.locator("#xml-upload").setInputFiles({ name: "ambiguous.xlsm", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12", buffer: ambiguousWorkbook() });
  await expect(page.getByText("ambiguous.xlsm", { exact: true })).toBeVisible();
  await page.getByText("Workbook import settings", { exact: true }).click();
  await expect(page.getByText(/Some values in BirthDate are ambiguous/)).toBeVisible();
  await page.getByLabel("Day / month / year").check();
  await expect(page.getByLabel("Day / month / year")).toBeChecked();
  await page.getByRole("button", { name: "Validate & Fix" }).last().click();
  await expect(page.getByRole("heading", { name: "Quality assessment" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator("#xml-upload")).toBeAttached();
  await expectNoPersistentState(context, page);

  await page.getByRole("button", { name: "Compare Files" }).click();
  await page.locator("#xml-upload").setInputFiles({ name: "stale-previous.xml", mimeType: "application/xml", buffer: Buffer.from(comparisonCurrent) });
  await page.locator("#xml-upload").setInputFiles({ name: "previous.xml", mimeType: "application/xml", buffer: Buffer.from(comparisonPrevious) });
  await expect(page.getByText("previous.xml", { exact: true })).toBeVisible();
  const currentDropzone = page.locator("section.file-field").filter({ hasText: "Current file" }).locator(".file-dropzone");
  await dropFile(page, currentDropzone, "stale-current.xml", Buffer.from(comparisonPrevious));
  await dropFile(page, currentDropzone, "current.xml", Buffer.from(comparisonCurrent));
  await expect(page.getByText("current.xml", { exact: true })).toBeVisible();
  await page.getByLabel("Previous source system").fill(markers.previousSource);
  await page.getByLabel("Current source system").fill(markers.currentSource);
  await page.getByLabel("Comparison reviewer").fill(markers.comparisonReviewer);
  await page.getByRole("button", { name: "Compare Files" }).last().click();
  await expect(page.getByRole("heading", { name: "STIX file comparison" })).toBeVisible();
  await page.getByLabel(/reviewer/i).last().fill(markers.decisionReviewer);
  await page.getByRole("button", { name: `Inspect ${markers.record} Student` }).click();
  await page.getByRole("button", { name: "Keep current" }).click();
  const reviewLog = await downloadedText(page, () => page.getByRole("button", { name: "Review log" }).click());
  expect(reviewLog.text).toContain(markers.previousSource);
  expect(reviewLog.text).toContain(markers.currentSource);
  expect(reviewLog.text).toContain(markers.comparisonReviewer);
  expect(reviewLog.text).toContain(markers.decisionReviewer);
  await page.getByRole("button", { name: "Compare another pair" }).click();
  await expect(page.locator("#xml-upload")).toHaveValue("");
  await expect(page.locator("#xml-upload-current")).toHaveCount(0);
  await expectNoPersistentState(context, page);
  await page.reload();
  await expectNoPersistentState(context, page);
  expect(observed.violations).toEqual([]);
  const observedText = `${observed.logs.join("\n")}\n${observed.navigations.join("\n")}`;
  for (const marker of Object.values(markers)) expect(observedText).not.toContain(marker);
});

test("privacy controls detect attempted egress and forbidden storage", async ({ context, page }) => {
  const { violations } = await installGuard(context, page);
  await page.goto("./");
  await expectNoPersistentState(context, page);
  await page.evaluate(() => fetch("https://example.invalid/privacy-negative-control", { method: "POST", body: "synthetic" }).catch(() => undefined));
  await expect.poll(() => violations.length).toBeGreaterThan(0);
  const beforeSameOrigin = violations.length;
  await page.evaluate((marker) => fetch(`/PanoReady/not-a-built-artifact?value=${marker}`).catch(() => undefined), markers.record);
  await expect.poll(() => violations.length).toBeGreaterThan(beforeSameOrigin);
  await page.evaluate((marker) => localStorage.setItem("negative-control", marker), markers.record);
  await context.addCookies([{ name: "negative-control", value: markers.record, url: origin, httpOnly: true }]);
  const state = await persistentState(context, page);
  expect(state.local).not.toEqual([]);
  expect(state.cookies).not.toEqual([]);
  await expect(expectNoPersistentState(context, page)).rejects.toThrow();
  await page.evaluate(() => localStorage.removeItem("negative-control"));
  await context.clearCookies();
  await expectNoPersistentState(context, page);
});
