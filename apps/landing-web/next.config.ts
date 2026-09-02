import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { NextConfig } from "next";

// The standalone tracer must start at the monorepo root, otherwise it cannot follow the
// pnpm workspace symlink into packages/ui and the server ships without its styles.
const monorepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true
};

export default nextConfig;
