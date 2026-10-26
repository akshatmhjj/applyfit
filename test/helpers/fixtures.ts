import { ProfileSchema, type Profile } from "../../src/shared/schemas/profile";
import type { JobExtraction } from "../../src/jobs/extract";
import type { ProviderAdapter } from "../../src/shared/providers/provider";
import { vi } from "vitest";

export const TEST_PROFILE: Profile = ProfileSchema.parse({
  version: 1,
  contact: {
    name: "Alex Example",
    email: "alex@example.com",
    phone: "+1 555 0100 123",
    city: "Springfield",
  },
  preferences: { locations: ["Berlin"], remoteOk: true, needsVisaSponsorship: false },
  skills: [
    { id: "s1", name: "TypeScript", years: 4 },
    { id: "s2", name: "PostgreSQL", years: 5 },
  ],
  experience: [
    {
      id: "e1",
      company: "Acme Secret Employer",
      title: "Software Engineer",
      start: "2021-06",
      end: "2024-03",
      bullets: [{ id: "b1", text: "Reduced p95 query latency on the orders database by 30%." }],
    },
  ],
  projects: [],
  education: [],
});

export function extraction(text: string): JobExtraction {
  return { method: "visible-text", text, truncated: false };
}

// A provider double. The returned text is whatever the test scripts.
export function scriptedProvider(reply: string | Error): ProviderAdapter & {
  complete: ReturnType<typeof vi.fn>;
} {
  const complete = vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return {
    id: "gemini",
    label: "test",
    origin: "https://test.invalid/*",
    complete,
  };
}

export const VALID_MODEL_OUTPUT = JSON.stringify({
  job: {
    title: "Backend Engineer",
    seniority: "senior",
    level: "L5",
    requiredSkills: ["TypeScript", "PostgreSQL"],
    niceToHave: ["Kafka"],
    location: "Berlin, DE",
    remote: "onsite",
    visaSponsorship: "unknown",
    summary: "Payments infrastructure team.",
  },
  match: {
    fitScore: 80,
    matchedSkills: ["TypeScript", "PostgreSQL"],
    gaps: ["Kafka"],
    reason: "Strong match on the core stack.",
  },
});
