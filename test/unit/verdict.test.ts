import { describe, expect, it } from "vitest";
import { decideVerdict, evaluateGates } from "../../src/analysis/verdict";
import type { Job } from "../../src/analysis/schemas";
import type { Preferences } from "../../src/shared/schemas/profile";

const job: Job = {
  title: "Backend Engineer",
  seniority: "senior",
  level: "L5",
  requiredSkills: ["TypeScript"],
  niceToHave: [],
  location: "Berlin, DE",
  remote: "onsite",
  visaSponsorship: "unknown",
  summary: "Payments infrastructure.",
};

const prefs: Preferences = {
  locations: ["Berlin"],
  remoteOk: true,
  needsVisaSponsorship: false,
};

describe("hard gates", () => {
  it("fails a role that refuses visa sponsorship when the user needs it", () => {
    const gates = evaluateGates({ ...job, visaSponsorship: "no" }, { ...prefs, needsVisaSponsorship: true });
    expect(gates.failures).toHaveLength(1);
  });

  it("does not fail when the user does not need sponsorship", () => {
    const gates = evaluateGates({ ...job, visaSponsorship: "no" }, prefs);
    expect(gates.failures).toEqual([]);
  });

  it("warns, not fails, when sponsorship is unstated and the user needs it", () => {
    const gates = evaluateGates(job, { ...prefs, needsVisaSponsorship: true });
    expect(gates.failures).toEqual([]);
    expect(gates.warnings.join(" ")).toMatch(/Visa sponsorship is not stated/);
  });

  it("fails a remote role when the user does not want remote work", () => {
    const gates = evaluateGates({ ...job, remote: "remote" }, { ...prefs, remoteOk: false });
    expect(gates.failures).toHaveLength(1);
  });

  it("fails an on-site role outside the preferred locations", () => {
    const gates = evaluateGates({ ...job, location: "Munich, DE" }, prefs);
    expect(gates.failures).toHaveLength(1);
  });

  it("passes an on-site role in a preferred location, ignoring case", () => {
    const gates = evaluateGates({ ...job, location: "BERLIN, Germany" }, prefs);
    expect(gates.failures).toEqual([]);
  });

  it("does not check location when the user has no location preferences", () => {
    const gates = evaluateGates({ ...job, location: "Munich, DE" }, { ...prefs, locations: [] });
    expect(gates.failures).toEqual([]);
  });

  it("warns when the office location is missing", () => {
    const gates = evaluateGates({ ...job, location: null }, prefs);
    expect(gates.failures).toEqual([]);
    expect(gates.warnings.join(" ")).toMatch(/location is not stated/);
  });
});

describe("verdict", () => {
  const clean = { failures: [], warnings: [] };

  it("uses the thresholds from config: 75 apply, 50 tailor, below 50 skip", () => {
    expect(decideVerdict(100, clean)).toBe("apply");
    expect(decideVerdict(75, clean)).toBe("apply");
    expect(decideVerdict(74, clean)).toBe("apply_with_tailored_resume");
    expect(decideVerdict(50, clean)).toBe("apply_with_tailored_resume");
    expect(decideVerdict(49, clean)).toBe("skip");
    expect(decideVerdict(0, clean)).toBe("skip");
  });

  it("a hard failure forces Skip, even with a perfect score", () => {
    expect(decideVerdict(100, { failures: ["nope"], warnings: [] })).toBe("skip");
  });
});
