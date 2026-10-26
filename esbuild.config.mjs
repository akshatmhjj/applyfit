// Bundles the extension pages and copies static files into dist/.
// Output is loaded unpacked from dist/. No sourcemaps: dist is a build artifact.
import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

const staticFiles = [
  "src/manifest.json",
  "src/sidepanel/index.html",
  "src/options/index.html",
  "src/shared/ui/base.css",
];

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: {
    "sidepanel/main": "src/sidepanel/main.ts",
    "options/options": "src/options/options.ts",
  },
  bundle: true,
  outdir: "dist",
  format: "esm",
  platform: "browser",
  target: "chrome120",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
});

for (const file of staticFiles) {
  const dest = file.replace(/^src\//, "dist/");
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(file, dest);
}
