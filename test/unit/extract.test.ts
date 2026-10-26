// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractJob, MAX_JOB_CHARS } from "../../src/jobs/extract";

function load(path: string): Document {
  return new DOMParser().parseFromString(readFileSync(path, "utf8"), "text/html");
}

describe("job extraction", () => {
  it("prefers JobPosting JSON-LD over visible text", () => {
    const result = extractJob(load("test/fixtures/jobs/json-ld.html"));
    expect(result.method).toBe("json-ld");
    expect(result.text).toContain("Title: Senior Backend Engineer");
    expect(result.text).toContain("Location: Berlin, DE");
    expect(result.text).toContain("Workplace: TELECOMMUTE");
    expect(result.text).toContain("TypeScript and PostgreSQL");
    expect(result.text).not.toContain("This visible text is ignored");
  });

  it("strips HTML from the JSON-LD description and never reads script bodies", () => {
    const result = extractJob(load("test/fixtures/jobs/json-ld.html"));
    expect(result.text).not.toContain("<p>");
    expect(result.text).not.toContain("<strong>");
    expect(result.text).not.toContain("not job text");
  });

  it("falls back to visible text when there is no JSON-LD", () => {
    const result = extractJob(load("test/fixtures/jobs/plain.html"));
    expect(result.method).toBe("visible-text");
    expect(result.text).toContain("Frontend Engineer, Remote");
    expect(result.text).toContain("Requirements: React, TypeScript");
  });

  it("drops scripts, styles, navigation, footers, buttons, and hidden elements", () => {
    const result = extractJob(load("test/fixtures/jobs/plain.html"));
    expect(result.text).not.toContain("not job text");
    expect(result.text).not.toContain("Jobs Teams Benefits");
    expect(result.text).not.toContain("Privacy policy");
    expect(result.text).not.toContain("Apply now");
    expect(result.text).not.toContain("must not be read");
    expect(result.text).not.toContain("Decorative text");
    expect(result.text).not.toContain("promo");
  });

  it("caps the text at 15,000 characters and says so", () => {
    const doc = new DOMParser().parseFromString(
      `<main>${"word ".repeat(10_000)}</main>`,
      "text/html",
    );
    const result = extractJob(doc);
    expect(result.text.length).toBe(MAX_JOB_CHARS);
    expect(result.truncated).toBe(true);
  });

  it("reports no truncation for short pages", () => {
    expect(extractJob(load("test/fixtures/jobs/plain.html")).truncated).toBe(false);
  });

  it("survives malformed JSON-LD and falls back to visible text", () => {
    const doc = new DOMParser().parseFromString(
      `<script type="application/ld+json">{ not json</script><main>Backend role in Paris.</main>`,
      "text/html",
    );
    const result = extractJob(doc);
    expect(result.method).toBe("visible-text");
    expect(result.text).toContain("Backend role in Paris.");
  });

  it("finds a JobPosting inside an @graph array", () => {
    const doc = new DOMParser().parseFromString(
      `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"JobPosting","title":"Graph Role"}]}</script>`,
      "text/html",
    );
    const result = extractJob(doc);
    expect(result.method).toBe("json-ld");
    expect(result.text).toContain("Title: Graph Role");
  });
});
