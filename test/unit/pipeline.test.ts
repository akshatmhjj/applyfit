import { describe, expect, it, vi } from "vitest";
import { runAnalysis, type AnalysisDeps } from "../../src/analysis/pipeline";
import { ProviderError } from "../../src/shared/providers/provider";
import { extraction, scriptedProvider, TEST_PROFILE, VALID_MODEL_OUTPUT } from "../helpers/fixtures";

function deps(provider: ReturnType<typeof scriptedProvider>, extra: Partial<AnalysisDeps> = {}): AnalysisDeps {
  return {
    provider,
    model: "gemini-2.5-flash",
    apiKey: "test-key",
    fetch: vi.fn() as unknown as AnalysisDeps["fetch"],
    signal: new AbortController().signal,
    ...extra,
  };
}

const JOB = extraction("Backend Engineer in Berlin. Requires TypeScript and PostgreSQL.");

describe("runAnalysis", () => {
  it("returns a verdict for a valid answer", async () => {
    const provider = scriptedProvider(VALID_MODEL_OUTPUT);
    const outcome = await runAnalysis(JOB, TEST_PROFILE, deps(provider));
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.verdict).toBe("apply");
      expect(outcome.match.fitScore).toBe(80);
      expect(outcome.sent).toEqual({ jobCharacters: JOB.text.length, skills: 2, roles: 1, bullets: 1 });
    }
  });

  it("makes exactly one provider call per analysis", async () => {
    const provider = scriptedProvider(VALID_MODEL_OUTPUT);
    await runAnalysis(JOB, TEST_PROFILE, deps(provider));
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("sends no contact details to the provider", async () => {
    const provider = scriptedProvider(VALID_MODEL_OUTPUT);
    await runAnalysis(JOB, TEST_PROFILE, deps(provider));
    const sent = JSON.stringify(provider.complete.mock.calls[0]);
    expect(sent).not.toContain("alex@example.com");
    expect(sent).not.toContain("555 0100");
    expect(sent).not.toContain("Alex Example");
    expect(sent).not.toContain("Acme Secret Employer");
  });

  it("uses the model the user chose", async () => {
    const provider = scriptedProvider(VALID_MODEL_OUTPUT);
    await runAnalysis(JOB, TEST_PROFILE, deps(provider, { model: "gemini-test-model" }));
    expect(provider.complete.mock.calls[0]?.[0]).toMatchObject({ model: "gemini-test-model" });
  });

  it("does not call the provider when there is no job text", async () => {
    const provider = scriptedProvider(VALID_MODEL_OUTPUT);
    const outcome = await runAnalysis(extraction("   "), TEST_PROFILE, deps(provider));
    expect(outcome).toEqual({ status: "no-job-text" });
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("blocks the call, without contacting the provider, if the outgoing scan finds anything", async () => {
    const provider = scriptedProvider(VALID_MODEL_OUTPUT);
    const outcome = await runAnalysis(
      JOB,
      TEST_PROFILE,
      deps(provider, { scan: () => ["email"] }),
    );
    expect(outcome).toEqual({ status: "blocked", findings: ["email"] });
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it("rejects non-JSON output", async () => {
    const outcome = await runAnalysis(JOB, TEST_PROFILE, deps(scriptedProvider("Sure! Here is my answer")));
    expect(outcome).toEqual({ status: "rejected", reason: "invalid-output" });
  });

  it("rejects output with an extra key, such as a submit instruction", async () => {
    const withExtra = JSON.stringify({ ...JSON.parse(VALID_MODEL_OUTPUT), submit: true });
    const outcome = await runAnalysis(JOB, TEST_PROFILE, deps(scriptedProvider(withExtra)));
    expect(outcome).toEqual({ status: "rejected", reason: "invalid-output" });
  });

  it("rejects an out-of-range fit score", async () => {
    const bad = JSON.parse(VALID_MODEL_OUTPUT);
    bad.match.fitScore = 101;
    const outcome = await runAnalysis(JOB, TEST_PROFILE, deps(scriptedProvider(JSON.stringify(bad))));
    expect(outcome).toEqual({ status: "rejected", reason: "invalid-output" });
  });

  it("rejects a matched skill that is not in the profile", async () => {
    const bad = JSON.parse(VALID_MODEL_OUTPUT);
    bad.match.matchedSkills = ["Rust"];
    const outcome = await runAnalysis(JOB, TEST_PROFILE, deps(scriptedProvider(JSON.stringify(bad))));
    expect(outcome).toEqual({ status: "rejected", reason: "unknown-skill" });
  });

  it("matches skills against the profile ignoring case", async () => {
    const cased = JSON.parse(VALID_MODEL_OUTPUT);
    cased.match.matchedSkills = ["typescript"];
    const outcome = await runAnalysis(JOB, TEST_PROFILE, deps(scriptedProvider(JSON.stringify(cased))));
    expect(outcome.status).toBe("ok");
  });

  it("forces Skip when a hard gate fails, even with a high score", async () => {
    const hardGate = JSON.parse(VALID_MODEL_OUTPUT);
    hardGate.job.remote = "onsite";
    hardGate.job.location = "Munich, DE";
    const outcome = await runAnalysis(JOB, TEST_PROFILE, deps(scriptedProvider(JSON.stringify(hardGate))));
    expect(outcome.status).toBe("ok");
    if (outcome.status === "ok") {
      expect(outcome.gates.failures).toHaveLength(1);
      expect(outcome.verdict).toBe("skip");
    }
  });

  it("maps provider errors to a status, with no detail", async () => {
    const outcome = await runAnalysis(
      JOB,
      TEST_PROFILE,
      deps(scriptedProvider(new ProviderError("RATE_LIMITED", 429))),
    );
    expect(outcome).toEqual({ status: "provider-error", code: "RATE_LIMITED" });
  });

  it("lets unexpected errors through instead of hiding them", async () => {
    await expect(
      runAnalysis(JOB, TEST_PROFILE, deps(scriptedProvider(new TypeError("bug")))),
    ).rejects.toThrow("bug");
  });
});
