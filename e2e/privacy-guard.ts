import { expect, type BrowserContext, type Page, type Request } from "@playwright/test";
import { existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

const origin = "http://127.0.0.1:4173";
const root = resolve("out");
export const markers = {
  record: "SYNTH_RECORD_Q7X9",
  filename: "SYNTH_FILENAME_R4T8.xml",
  password: "SYNTH_PASSWORD_C8N4",
};

function requestViolation(request: Request): string | undefined {
  const url = new URL(request.url());
  if (url.origin !== origin || !url.pathname.startsWith("/PanoReady/")) return "Unexpected destination";
  if (!["GET", "HEAD"].includes(request.method()) || request.postData()) return "Unexpected method or body";
  if (url.search || url.hash) return "Unexpected URL parameters";
  let file;
  try {
    file = resolve(root, decodeURIComponent(url.pathname.slice("/PanoReady/".length)));
  } catch {
    return "Invalid artifact path";
  }
  if (file !== root && !file.startsWith(root + sep)) return "Unsafe artifact path";
  if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, "index.html");
  if (!existsSync(file) || !statSync(file).isFile()) return "Not a built artifact";
  const text = `${request.url()} ${JSON.stringify(request.headers())}`;
  if (Object.values(markers).some((marker) => text.includes(marker))) return "Private marker in request";
}

export async function persistentState(context: BrowserContext, page: Page) {
  return {
    ...await page.evaluate(async () => ({
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
      databases: await indexedDB.databases(),
      caches: await caches.keys(),
    })),
    cookies: await context.cookies(),
  };
}

export async function expectNoPersistentState(context: BrowserContext, page: Page) {
  // These flows use the built-in profile and never ask to save custom settings.
  expect(await persistentState(context, page)).toEqual({ local: [], session: [], databases: [], caches: [], cookies: [] });
}

export async function installGuard(context: BrowserContext, page: Page) {
  const violations: string[] = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const navigations: string[] = [];
  context.on("request", (request) => {
    const violation = requestViolation(request);
    if (violation) violations.push(violation);
  });
  const observePage = (candidate: Page) => {
    candidate.on("console", (message) => logs.push(message.text()));
    candidate.on("pageerror", (error) => errors.push(error.message));
    candidate.on("framenavigated", (frame) => navigations.push(frame.url()));
  };
  observePage(page);
  context.on("page", observePage);
  await context.routeWebSocket("**/*", (socket) => {
    violations.push("Unexpected WebSocket");
    socket.close();
  });
  await context.route("**/*", async (route) => {
    if (requestViolation(route.request())) await route.abort("blockedbyclient");
    else await route.continue();
  });
  return {
    violations,
    async assertPrivate() {
      expect(violations).toEqual([]);
      expect(errors).toEqual([]);
      for (const marker of Object.values(markers)) {
        expect([...logs, ...navigations].join("\n")).not.toContain(marker);
      }
      await expectNoPersistentState(context, page);
    },
  };
}
