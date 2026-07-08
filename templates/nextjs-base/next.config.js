// Preview proxy support: when the workspace container is served under a reverse-proxy
// sub-path (e.g. /preview/<slug>/), Next must emit routes + assets under that same base
// so the browser requests them back through the proxy. The orchestrator injects
// EVCP_PREVIEW_BASE=/preview/<slug> into the container env at provision time.
const previewBase = process.env.EVCP_PREVIEW_BASE;

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(previewBase ? { basePath: previewBase, assetPrefix: previewBase } : {}),
  // Expose the base path to client code so fetches to same-app API routes resolve through the
  // proxy: fetch(`${process.env.NEXT_PUBLIC_BASE_PATH}/api/...`). (Next prepends basePath to
  // <Link>/router navigation but NOT to fetch(), so client fetches must prefix it themselves.)
  env: { NEXT_PUBLIC_BASE_PATH: previewBase || "" }
};

module.exports = nextConfig;
