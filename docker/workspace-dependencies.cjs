const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const dependencyKeys = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "overrides",
  "resolutions",
  "engines",
  "os",
  "cpu",
  "libc",
  "workspaces",
  "packageManager"
];
const installHooks = ["preinstall", "install", "postinstall", "prepare", "prepublish"];
function dependencyManifest(manifest) {
  const result = Object.fromEntries(
    dependencyKeys.filter((key) => key in manifest).map((key) => [key, manifest[key]])
  );
  result.scripts = Object.fromEntries(
    installHooks.filter((key) => manifest.scripts?.[key]).map((key) => [key, manifest.scripts[key]])
  );
  return result;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  return value;
}
function fingerprint(directory) {
  const manifest = dependencyManifest(
    JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"))
  );
  const lockPath = path.join(directory, "package-lock.json");
  let lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : null;
  if (lock) {
    const { name: _name, version: _version, ...resolution } = lock;
    lock = resolution;
    if (lock.packages?.[""]) lock.packages[""] = dependencyManifest(lock.packages[""]);
  }
  const npmrc = path.join(directory, ".npmrc");
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          manifest,
          lock,
          npmrc: fs.existsSync(npmrc) ? fs.readFileSync(npmrc, "utf8") : "",
          abi: process.versions.modules,
          platform: process.platform,
          arch: process.arch
        })
      )
    )
    .digest("hex");
}
function writeStamp(directory) {
  fs.writeFileSync(
    path.join(directory, "node_modules/.evcp-dependencies-v2"),
    fingerprint(directory)
  );
}
function ensureDependencies(
  directory,
  template,
  install = () =>
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--prefer-offline"], {
      cwd: directory,
      stdio: "inherit"
    })
) {
  const modules = path.join(directory, "node_modules");
  const stamp = path.join(modules, ".evcp-dependencies-v2");
  const expected = fingerprint(directory);
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === expected) return "cached";
  // An unchanged dependency graph can use the image tree even after renaming the app or
  // editing dev/build scripts. Never replace a project's existing private dependency tree.
  const linked = fs.lstatSync(modules, { throwIfNoEntry: false })?.isSymbolicLink();
  if ((!fs.existsSync(modules) || linked) && expected === fingerprint(template)) {
    if (linked) fs.unlinkSync(modules);
    fs.symlinkSync(path.join(template, "node_modules"), modules, "dir");
    return "image";
  }
  if (linked) fs.unlinkSync(modules);
  install(); // Fail visibly; never mark a failed/partial install as reusable.
  writeStamp(directory); // npm can update the lockfile: fingerprint AFTER successful install.
  return "installed";
}
module.exports = { fingerprint, writeStamp, ensureDependencies };
if (require.main === module) writeStamp(process.argv[2]);
