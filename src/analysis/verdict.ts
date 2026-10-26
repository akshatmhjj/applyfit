import { VERDICT_THRESHOLDS } from "./config";
import type { Job } from "./schemas";
import type { Preferences } from "../shared/schemas/profile";

export type Verdict = "apply" | "apply_with_tailored_resume" | "skip";

export interface Gates {
  // Hard failures force Skip, whatever the score.
  failures: string[];
  // Things the user should check, but that do not block.
  warnings: string[];
}

// Deterministic checks against the user's stated preferences. The model does not decide these.
export function evaluateGates(job: Job, preferences: Preferences): Gates {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (job.visaSponsorship === "no" && preferences.needsVisaSponsorship) {
    failures.push("The job says it does not offer visa sponsorship, and you need it.");
  } else if (job.visaSponsorship === "unknown" && preferences.needsVisaSponsorship) {
    warnings.push("Visa sponsorship is not stated. Ask before applying.");
  }

  if (job.remote === "remote" && !preferences.remoteOk) {
    failures.push("This is a remote role, and you have said you do not want remote work.");
  }

  if ((job.remote === "onsite" || job.remote === "hybrid") && preferences.locations.length > 0) {
    if (job.location === null) {
      warnings.push("The office location is not stated.");
    } else {
      const location = job.location.toLowerCase();
      const preferred = preferences.locations.some((place) => location.includes(place.toLowerCase()));
      if (!preferred) {
        failures.push("This on-site or hybrid role is outside your preferred locations.");
      }
    }
  }

  if (job.remote === "unknown") {
    warnings.push("The remote policy is not stated.");
  }

  return { failures, warnings };
}

export function decideVerdict(fitScore: number, gates: Gates): Verdict {
  if (gates.failures.length > 0) return "skip";
  if (fitScore >= VERDICT_THRESHOLDS.apply) return "apply";
  if (fitScore >= VERDICT_THRESHOLDS.applyWithTailoredResume) return "apply_with_tailored_resume";
  return "skip";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  apply: "Apply",
  apply_with_tailored_resume: "Apply with tailored resume",
  skip: "Skip",
};
