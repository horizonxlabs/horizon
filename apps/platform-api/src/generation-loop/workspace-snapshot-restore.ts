// Next's running dev server watches the source directories themselves. Removing and recreating
// app/ during rollback invalidates those watches and leaves every page/API returning 404.
// Retain directories present in the protected snapshot, but clear all other entries before tar
// restores their contents. Dirents do not follow symlinks, including links to outside /workspace.
export const clearWorkspaceForSnapshotRestore = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const directories = new Set(
  fs.readFileSync(process.argv[1], "utf8").split("\n")
    .filter((line) => line.startsWith("d\t"))
    .map((line) => line.split("\t")[2])
);
function clear(directory, relative = "") {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!relative && (entry.name === ".git" || entry.name === "node_modules" ||
        entry.name === ".next" || entry.name.startsWith(".next-"))) continue;
    const child = path.join(directory, entry.name);
    const childRelative = relative ? relative + "/" + entry.name : entry.name;
    if (entry.isDirectory() && directories.has(childRelative)) {
      clear(child, childRelative);
    } else {
      fs.rmSync(child, { recursive: true, force: true });
    }
  }
}
clear("/workspace");
`;
