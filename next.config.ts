import type { NextConfig } from "next";

// JupyterHub/Kubeflow proxy strips the prefix before forwarding to Next.js,
// so basePath must NOT be set (Next.js would 404 every route).
// assetPrefix IS needed so the browser resolves asset URLs through the proxy.
//
// IMPORTANT: Jupyter sets PORT=8888 in the environment, but we always run
// Next.js on 3000. Do NOT use process.env.PORT here — it will bake in 8888.
const APP_PORT = "3000";
const nbPrefix = process.env.NB_PREFIX || "";
const assetPrefix = nbPrefix ? `${nbPrefix}/proxy/${APP_PORT}` : "";

const nextConfig: NextConfig = {
  assetPrefix: assetPrefix || undefined,
  // Required when accessing `next dev` through a notebook/Jupyter proxy host.
  // Include wildcard and `null` to support iframe/opaque origins used by some notebook proxies.
  allowedDevOrigins: ["ai.wdgpublichealth.ca", "*.wdgpublichealth.ca", "null"],
};

export default nextConfig;
