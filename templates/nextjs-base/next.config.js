// Preview proxy support: when the workspace container is served under a reverse-proxy
// sub-path (e.g. /preview/<slug>/), Next must emit routes + assets under that same base
// so the browser requests them back through the proxy. The orchestrator injects
// EVCP_PREVIEW_BASE=/preview/<slug> into the container env at provision time.
const previewBase = process.env.EVCP_PREVIEW_BASE;
const validationDistDir = process.env.EVCP_VALIDATION_DIST_DIR;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The image-backed dependency symlink lives beside /workspace, under /opt.
  turbopack: { root: process.env.EVCP_TURBOPACK_ROOT || __dirname },
  ...(validationDistDir ? { distDir: validationDistDir } : {}),
  ...(previewBase ? { basePath: previewBase, assetPrefix: previewBase } : {}),
  // Expose the base path to client code so fetches to same-app API routes resolve through the
  // proxy: fetch(`${process.env.NEXT_PUBLIC_BASE_PATH}/api/...`). (Next prepends basePath to
  // <Link>/router navigation but NOT to fetch(), so client fetches must prefix it themselves.)
  env: { NEXT_PUBLIC_BASE_PATH: previewBase || "" }
};

module.exports = nextConfig;
