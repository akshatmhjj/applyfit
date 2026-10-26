// Fails the build if any shipped script contains eval or the Function constructor.
// The extension CSP forbids both, so a match here would break at runtime.
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const forbidden = [
  { name: "eval()", pattern: /\beval\s*\(/ },
  { name: "new Function()", pattern: /\bnew\s+Function\s*\(/ },
];

async function listJs(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry);
    if ((await stat(path)).isDirectory()) {
      out.push(...(await listJs(path)));
    } else if (path.endsWith(".js")) {
      out.push(path);
    }
  }
  return out;
}

const files = await listJs("dist");
if (files.length === 0) {
  console.error("check-bundle: no .js files found in dist/. Run npm run build first.");
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const lines = (await readFile(file, "utf8")).split("\n");
  lines.forEach((line, i) => {
    for (const { name, pattern } of forbidden) {
      if (pattern.test(line)) {
        console.error(`${file}:${i + 1}: contains ${name}`);
        failures++;
      }
    }
  });
}

if (failures > 0) {
  console.error(`check-bundle: ${failures} forbidden pattern(s) found.`);
  process.exit(1);
}
console.log(`check-bundle: ${files.length} file(s) clean.`);
