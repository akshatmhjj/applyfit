import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync("src/manifest.json", "utf8"),
) as Record<string, unknown>;

describe("manifest security policy", () => {
  it("requests exactly the four permissions from the spec", () => {
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage", "sidePanel"]);
  });

  it("has no content_scripts, so nothing is injected without a user click", () => {
    expect(manifest).not.toHaveProperty("content_scripts");
  });

  it("never requests <all_urls> or any wildcard host", () => {
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain("<all_urls>");
    expect(serialized).not.toMatch(/"https?:\/\/\*\//);
  });

  it("limits optional host access to the two supported provider APIs", () => {
    expect(manifest.optional_host_permissions).toEqual([
      "https://generativelanguage.googleapis.com/*",
      "https://api.anthropic.com/*",
    ]);
    expect(manifest).not.toHaveProperty("host_permissions");
  });

  it("sets the exact extension-page CSP with no eval and no remote sources", () => {
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self'; object-src 'self'",
    });
  });

  it("uses manifest version 3", () => {
    expect(manifest.manifest_version).toBe(3);
  });
});
