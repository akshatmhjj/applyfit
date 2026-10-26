import { z } from "zod";

// Output schemas for the model's answer. Strict: any key not listed here makes the
// whole answer invalid, so an injected "submit" or "click" field cannot slip through.
// Every string is data for display only.

const Short = (max: number) => z.string().trim().max(max);
const SkillText = z.string().trim().min(1).max(80);

export const JobSchema = z.strictObject({
  title: Short(200),
  seniority: Short(50),
  level: Short(50),
  requiredSkills: z.array(SkillText).max(50),
  niceToHave: z.array(SkillText).max(50),
  location: Short(200).nullable(),
  remote: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  visaSponsorship: z.enum(["yes", "no", "unknown"]),
  summary: Short(600),
});

export const MatchSchema = z.strictObject({
  fitScore: z.number().int().min(0).max(100),
  matchedSkills: z.array(SkillText).max(100),
  gaps: z.array(SkillText).max(50),
  reason: Short(500),
});

export const AnalysisOutputSchema = z.strictObject({
  job: JobSchema,
  match: MatchSchema,
});

export type Job = z.infer<typeof JobSchema>;
export type Match = z.infer<typeof MatchSchema>;
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

// Parses a model answer. Returns null, never throws, so callers can show a clean rejection.
export function parseAnalysisOutput(raw: string): AnalysisOutput | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = AnalysisOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
