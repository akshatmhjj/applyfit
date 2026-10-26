import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Static checks on the code that handles job pages and model output. The analysis path
// must never click, submit, navigate, or open a network request of its own.
// The provider adapters are the only place that talks to the network.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

const ANALYSIS_CODE = [
  ...sourceFiles("src/analysis"),
  ...sourceFiles("src/jobs"),
  "src/sidepanel/analyze.ts",
];

const FORBIDDEN_ACTIONS = [
  /\.click\s*\(/,
  /\.submit\s*\(/,
  /requestSubmit\s*\(/,
  /window\.location/,
  /location\.(href|assign|replace)/,
  /window\.open\s*\(/,
  /chrome\.tabs\.(update|create)\s*\(/,
  /\.dispatchEvent\s*\(/,
];

describe("analysis code takes no page action", () => {
  for (const file of ANALYSIS_CODE) {
    it(`${file} has no click, submit, or navigation`, () => {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_ACTIONS) {
        expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    });
  }

  // The adapters receive fetch as a parameter and call it only through send() in provider.ts.
  // The side panel passes the global fetch in, once, inside the Analyze and Autofill flows.
  it("only the shared provider sender and the two side-panel flows touch the network", () => {
    const networkUsers = sourceFiles("src")
      .filter((file) => /\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(readFileSync(file, "utf8")))
      .sort();
    expect(networkUsers).toEqual([
      "src/shared/providers/provider.ts",
      "src/sidepanel/analyze.ts",
      "src/sidepanel/autofill.ts",
    ]);
  });
});
