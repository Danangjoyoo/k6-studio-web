/**
 * Reads all .d.ts files (plus package.json) from node_modules/@types/k6/ and
 * writes them as a JSON array to public/k6-types.json so Monaco can load them
 * at runtime. The package.json is required so Monaco's TypeScript worker can
 * resolve bare/subpath specifiers like "k6/http" via its "exports" map.
 * Runs automatically via prebuild/predev npm lifecycle hooks.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, relative } from "path";

const k6TypesDir = join(process.cwd(), "node_modules/@types/k6");
const outputFile = join(process.cwd(), "public/k6-types.json");

function collectTypeFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      result.push(...collectTypeFiles(fullPath));
    } else if (entry.endsWith(".d.ts") || entry === "package.json") {
      const relativePath = relative(k6TypesDir, fullPath);
      result.push({
        path: relativePath,
        content: readFileSync(fullPath, "utf-8"),
      });
    }
  }
  return result;
}

const types = collectTypeFiles(k6TypesDir);
writeFileSync(outputFile, JSON.stringify(types));
console.log(
  `[generate-k6-types] wrote ${types.length} type files to public/k6-types.json`
);
