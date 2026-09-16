import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:4173/PanoReady/";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  forbidOnly: !!process.env.CI,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  webServer: {
    command: process.env.E2E_PREBUILT === "1"
      ? "node e2e/static-server.mjs"
      : "npm run e2e:build && node e2e/static-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
