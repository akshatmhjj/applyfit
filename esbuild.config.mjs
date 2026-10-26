// Bundles the extension pages and the content script, and copies static files into dist/.
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

const shared = {
  bundle: true,
  outdir: "dist",
  platform: "browser",
  target: "chrome120",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
};

// Extension pages are ES modules.
await build({
  ...shared,
  entryPoints: {
    "sidepanel/main": "src/sidepanel/main.ts",
    "options/options": "src/options/options.ts",
  },
  format: "esm",
});

// The content script is injected with chrome.scripting.executeScript(files), which needs a
// classic script. An IIFE with a global name exposes extractPage() to the side panel.
const contentScripts = [
  { entry: "extractJob", globalName: "JobFitExtract" },
  { entry: "scanFields", globalName: "JobFitScan" },
  { entry: "fillFields", globalName: "JobFitFill" },
];
for (const { entry, globalName } of contentScripts) {
  await build({
    ...shared,
    entryPoints: { [`content/${entry}`]: `src/content/${entry}.ts` },
    format: "iife",
    globalName,
  });
}

for (const file of staticFiles) {
  const dest = file.replace(/^src\//, "dist/");
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(file, dest);
}
