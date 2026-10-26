import type { JobExtraction } from "../jobs/extract";
import { contactValuesOf, buildAnalysisRequest, scanProfileText, type SentSummary } from "./prompt";
import { parseAnalysisOutput, type Job, type Match } from "./schemas";
import { decideVerdict, evaluateGates, type Gates, type Verdict } from "./verdict";
import type { Profile } from "../shared/schemas/profile";
import { ProviderError, type FetchLike, type ProviderAdapter, type ProviderErrorCode } from "../shared/providers/provider";

export interface AnalysisDeps {
  provider: ProviderAdapter;
  model: string;
  apiKey: string;
  fetch: FetchLike;
  signal: AbortSignal;
  // Tests can replace the outgoing scan to prove that a finding blocks the call.
  scan?: (profileText: string, contactValues: readonly string[]) => string[];
}

export type AnalysisOutcome =
  | {
      status: "ok";
      job: Job;
      match: Match;
      gates: Gates;
      verdict: Verdict;
      sent: SentSummary;
    }
  | { status: "no-job-text" }
  | { status: "blocked"; findings: string[] }
  | { status: "rejected"; reason: "invalid-output" | "unknown-skill" }
  | { status: "provider-error"; code: ProviderErrorCode };

// One model call per Analyze click. Everything the model returns is checked against a
// strict schema, and skills it names must exist in the profile. Only then is a verdict made.
export async function runAnalysis(
  extraction: JobExtraction,
  profile: Profile,
  deps: AnalysisDeps,
): Promise<AnalysisOutcome> {
  if (extraction.text.trim() === "") {
    return { status: "no-job-text" };
  }

  const contact = contactValuesOf(profile);
  const built = buildAnalysisRequest(extraction.text, profile, contact);

  const scan = deps.scan ?? scanProfileText;
  const findings = scan(built.profileText, contact);
  if (findings.length > 0) {
    return { status: "blocked", findings };
  }

  let raw: string;
  try {
    raw = await deps.provider.complete(
      { ...built.request, model: deps.model },
      deps.apiKey,
      { fetch: deps.fetch, signal: deps.signal },
    );
  } catch (error) {
    if (error instanceof ProviderError) {
      return { status: "provider-error", code: error.code };
    }
    throw error;
  }

  const output = parseAnalysisOutput(raw);
  if (output === null) {
    return { status: "rejected", reason: "invalid-output" };
  }

  const knownSkills = new Set(profile.skills.map((skill) => skill.name.toLowerCase()));
  const invented = output.match.matchedSkills.some((skill) => !knownSkills.has(skill.toLowerCase()));
  if (invented) {
    return { status: "rejected", reason: "unknown-skill" };
  }

  const gates = evaluateGates(output.job, profile.preferences);
  return {
    status: "ok",
    job: output.job,
    match: output.match,
    gates,
    verdict: decideVerdict(output.match.fitScore, gates),
    sent: built.sent,
  };
}
