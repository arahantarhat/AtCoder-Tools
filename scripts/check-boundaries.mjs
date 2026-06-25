import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve("src");
const files = await collect(root);
const violations = [];
const featureNames = new Set(await readdir(join(root, "features")));

for (const file of files) {
  const source = await readFile(file, "utf8");
  const feature = relative(root, file).match(/^features\/([^/]+)\//)?.[1];
  if (!feature) continue;
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    const crossFeature = specifier.match(/^\.\.\/([^/]+)(\/.*)?$/);
    if (!crossFeature || !featureNames.has(crossFeature[1]) || crossFeature[1] === feature) continue;
    if (crossFeature[2]) {
      violations.push(`${relative(root, file)} imports private feature module ${specifier}`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
}

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collect(path);
    return extname(entry.name) === ".ts" ? [path] : [];
  }));
  return nested.flat();
}
