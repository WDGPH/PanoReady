import type { NextConfig } from "next";

// JupyterHub/Kubeflow proxy strips the prefix before forwarding to Next.js,
// so basePath must NOT be set (Next.js would 404 every route).
// assetPrefix IS needed so the browser resolves asset URLs through the proxy.
//
// IMPORTANT: Jupyter sets PORT=8888 in the environment, but we always run
// Next.js on 3000. Do NOT use process.env.PORT here — it will bake in 8888.
const APP_PORT = "3000";
const nbPrefix = process.env.NB_PREFIX || "";
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const pagesBasePath = "/PanoReady";
const assetPrefix = isGitHubPages
  ? pagesBasePath
  : nbPrefix
    ? `${nbPrefix}/proxy/${APP_PORT}`
    : "";

const nextConfig: NextConfig = {
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
  allowedDevOrigins: ["*.wdgpublichealth.ca"],
};

export default nextConfig;
