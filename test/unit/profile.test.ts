import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProfileJson } from "../../src/shared/schemas/profile";

const example = readFileSync("profile.example.json", "utf8");

function minimal(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    contact: {},
    preferences: { locations: [], remoteOk: false, needsVisaSponsorship: false },
    skills: [],
    experience: [],
    projects: [],
    education: [],
    ...overrides,
  });
}

describe("profile schema", () => {
  it("accepts the example profile, which is fake data", () => {
    const result = parseProfileJson(example);
    expect(result.ok).toBe(true);
  });

  it("accepts a minimal profile", () => {
    expect(parseProfileJson(minimal()).ok).toBe(true);
  });

  it("rejects invalid JSON without echoing the input", () => {
    const result = parseProfileJson("{ not json alex@example.com");
    expect(result).toEqual({ ok: false, errors: ["Not valid JSON."] });
  });

  it("rejects unknown top-level keys, so typos do not silently drop data", () => {
    const result = parseProfileJson(minimal({ skils: [] }));
    expect(result.ok).toBe(false);
  });

  it("rejects unknown keys inside contact", () => {
    const result = parseProfileJson(minimal({ contact: { nickname: "Al" } }));
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate id across different entry types", () => {
    const result = parseProfileJson(
      minimal({
        skills: [{ id: "same-id", name: "TypeScript" }],
        education: [{ id: "same-id", school: "Uni", degree: "BSc" }],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain('duplicate id "same-id"');
    }
  });

  it("rejects a duplicate bullet id inside an experience entry", () => {
    const result = parseProfileJson(
      minimal({
        experience: [
          {
            id: "exp-1",
            company: "Co",
            title: "Eng",
            start: "2020",
            bullets: [
              { id: "b", text: "one" },
              { id: "b", text: "two" },
            ],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects ids with characters outside the allowed set", () => {
    const result = parseProfileJson(
      minimal({ skills: [{ id: "bad id!", name: "TypeScript" }] }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an over-long bullet", () => {
    const result = parseProfileJson(
      minimal({
        experience: [
          {
            id: "exp-1",
            company: "Co",
            title: "Eng",
            start: "2020",
            bullets: [{ id: "b1", text: "x".repeat(501) }],
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("reports error paths without including the offending values", () => {
    const result = parseProfileJson(
      minimal({ skills: [{ id: "s1", name: "" }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("skills.0.name");
      expect(result.errors.join("\n")).not.toContain("alex@example.com");
    }
  });
});
