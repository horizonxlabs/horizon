import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// After the creator-web modularization, UI markers live across apps/creator-web/src/** (pages,
// hooks, components, data), not just main.tsx. These smoke tests assert a marker exists SOMEWHERE
// in the app source, so they read the whole tree instead of a single file.
export function readAllSourceFiles(dir) {
  let combined = "";
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      combined += readAllSourceFiles(fullPath);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      combined += readFileSync(fullPath, "utf8");
    }
  }
  return combined;
}
