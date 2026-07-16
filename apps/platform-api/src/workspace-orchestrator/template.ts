import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface GoldenTemplate {
  name: string;
  lockedFiles: string[];
  files: Array<{ path: string; content: string }>;
}

function walk(dir: string, root: string, out: Array<{ path: string; content: string }>): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, root, out);
    } else {
      out.push({ path: relative(root, full).replaceAll("\\", "/"), content: readFileSync(full, "utf8") });
    }
  }
}

export function loadGoldenTemplate(
  rootDir: string = fileURLToPath(new URL("../../../../templates/nextjs-base", import.meta.url))
): GoldenTemplate {
  const manifest = JSON.parse(readFileSync(join(rootDir, "template.json"), "utf8")) as {
    name: string;
    lockedFiles: string[];
  };
  const files: Array<{ path: string; content: string }> = [];
  walk(rootDir, rootDir, files);
  return {
    name: manifest.name,
    lockedFiles: manifest.lockedFiles,
    files: files.filter((file) => file.path !== "template.json")
  };
}

export function isLockedFile(template: GoldenTemplate, path: string): boolean {
  return template.lockedFiles.includes(path);
}
