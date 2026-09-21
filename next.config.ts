import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

// JupyterHub/Kubeflow proxy strips the prefix before forwarding to Next.js,
// so basePath must NOT be set (Next.js would 404 every route).
// assetPrefix IS needed so the browser resolves asset URLs through the proxy.
//
// IMPORTANT: Jupyter sets PORT=8888 in the environment, but we always run
// Next.js on 3000. Do NOT use process.env.PORT here — it will bake in 8888.
const APP_PORT = "3000";
const nbPrefix = process.env.NB_PREFIX || "";
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const pagesBasePath = process.env.PAGES_BASE_PATH || "/PanoReady";
const assetPrefix = isGitHubPages
  ? pagesBasePath
  : nbPrefix
    ? `${nbPrefix}/proxy/${APP_PORT}`
    : "";

// Resolve public build metadata for local development and production builds.
// Pages supplies these explicitly because its snapshots do not contain .git.
function git(...args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const head = process.env.NEXT_PUBLIC_BUILD_SHA || git("rev-parse", "HEAD");
const releaseTag = process.env.NEXT_PUBLIC_BUILD_VERSION
  ? ""
  : git("tag", "--merged", "HEAD", "--sort=-version:refname")
      .split("\n")
      .find((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
const buildVersion = process.env.NEXT_PUBLIC_BUILD_VERSION || (releaseTag
  ? `${releaseTag}${git("rev-parse", `${releaseTag}^{commit}`) === git("rev-parse", "HEAD") ? "" : "+"}`
  : "unversioned");

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
    NEXT_PUBLIC_BUILD_SHA: head ? head.slice(0, 8) : "unknown",
  },
  // GitHub Pages serves this project below /PanoReady and cannot run a Node.js
  // server. Keep the normal server build for every other environment.
  output: isGitHubPages ? "export" : undefined,
  basePath: isGitHubPages ? pagesBasePath : undefined,
  trailingSlash: isGitHubPages,
  assetPrefix: assetPrefix || undefined,
  // The workspace proxy strips assetPrefix, but Next's WebSocket handler
  // expects it. Send the stripped HMR endpoint back with its full path.
  ...(process.env.NODE_ENV === "development" && nbPrefix && !isGitHubPages
    ? {
        rewrites: async () => [
          {
            source: "/_next/hmr",
            destination: `http://127.0.0.1:${APP_PORT}${assetPrefix}/_next/hmr`,
          },
        ],
      }
    : {}),
  // Additional development proxy hosts; localhost remains allowed by Next.js.
  // See docs/development.md when using a different proxy hostname.
  // The JupyterHub pod hostname is also added so the browser can reach the dev
  // server through the workspace proxy (e.g. claude-code-0, jhub-*, etc.).
  allowedDevOrigins: ["*.wdgpublichealth.ca", "ai.wdgpublichealth.ca", process.env.HOSTNAME ?? ""].filter(Boolean),
};

export default nextConfig;
