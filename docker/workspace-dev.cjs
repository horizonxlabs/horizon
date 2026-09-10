const fs = require("node:fs");
const { spawn } = require("node:child_process");
const net = require("node:net");
const { ensureDependencies } = require("./workspace-dependencies.cjs");
const statusFile = "/tmp/evcp-preview-startup.json";
function stage(phase) {
  fs.writeFileSync(statusFile, JSON.stringify({ phase, updatedAt: new Date().toISOString() }));
  console.log(`[workspace] ${phase}`);
}
async function main() {
  stage("dependencies");
  console.log(
    `[workspace] dependencies: ${ensureDependencies("/workspace", "/opt/evcp-template")}`
  );
  stage("starting");
  const version = require("/workspace/node_modules/next/package.json").version;
  const linked = fs.lstatSync("/workspace/node_modules").isSymbolicLink();
  const configuredRoot =
    fs.existsSync("/workspace/next.config.js") &&
    fs.readFileSync("/workspace/next.config.js", "utf8").includes("EVCP_TURBOPACK_ROOT");
  const turbo =
    process.env.EVCP_WORKSPACE_BUNDLER !== "webpack" &&
    Number(version.split(".")[0]) >= 15 &&
    (!linked || configuredRoot);
  console.log(`[workspace] bundler: ${turbo ? "turbopack" : "webpack"}`);
  const command = [
    "run",
    "dev",
    "--",
    ...(turbo ? ["--turbopack"] : []),
    "--hostname",
    "0.0.0.0",
    "--port",
    "3000"
  ];
  const child = spawn("npm", command, { cwd: "/workspace", stdio: "inherit" });
  let stopped = false;
  child.on("exit", (code) => {
    stopped = true;
    stage("failed");
    process.exit(code ?? 1);
  });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  // Wait for the socket without compiling an extra health route, then precompile the app.
  const base = `http://127.0.0.1:3000${process.env.EVCP_PREVIEW_BASE || ""}`;
  for (let attempt = 0; attempt < 120 && !stopped; attempt++) {
    const open = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port: 3000 });
      const finish = (value) => {
        socket.destroy();
        resolve(value);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(1000, () => finish(false));
    });
    if (open) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  stage("compiling");
  try {
    const response = await fetch(base || "/", { signal: AbortSignal.timeout(120000) });
    await response.arrayBuffer();
    stage(response.ok ? "ready" : "error");
  } catch {
    stage("error");
  }
}
main().catch((error) => {
  console.error("[workspace] startup failed:", error.message);
  stage("failed");
  process.exitCode = 1;
});
