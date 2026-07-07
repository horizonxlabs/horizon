// Preview proxy support: when the workspace container is served under a reverse-proxy
// sub-path (e.g. /preview/<slug>/), Next must emit routes + assets under that same base
// so the browser requests them back through the proxy. The orchestrator injects
// EVCP_PREVIEW_BASE=/preview/<slug> into the container env at provision time.
const previewBase = process.env.EVCP_PREVIEW_BASE;

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(previewBase ? { basePath: previewBase, assetPrefix: previewBase } : {})
};

module.exports = nextConfig;
