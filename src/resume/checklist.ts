import type { Profile } from "../shared/schemas/profile";

// A checklist of resume changes, made without any AI call. It uses keyword matching only,
// so it can say which skills to lead with and which bullets to move up. It cannot judge gaps
// or rewording; those need the AI suggestions or your own reading of the job.

export type ChecklistItem =
  | { kind: "lead-skill"; skills: string[] }
  | { kind: "move-up"; sourceId: string; text: string; role: string }
  | { kind: "trim"; sourceId: string; text: string; role: string };

const STOPWORDS = new Set([
  "about", "above", "across", "after", "against", "also", "and", "are", "back", "been", "being",
  "below", "between", "both", "build", "candidate", "could", "does", "each", "from", "have", "having",
  "help", "here", "into", "its", "job", "just", "like", "make", "more", "most", "must", "need",
  "only", "other", "our", "out", "over", "role", "should", "some", "such", "team", "than", "that",
  "their", "them", "then", "there", "these", "they", "this", "those", "through", "under", "until",
  "using", "very", "want", "were", "what", "when", "where", "which", "while", "will", "with",
  "within", "work", "working", "would", "year", "years", "you", "your",
]);

// Move a bullet up only when it matches clearly more of the job than the bullet above it.
const MOVE_UP_MARGIN = 2;
const MAX_TRIM_CANDIDATES = 3;
const MIN_BULLETS_BEFORE_TRIM = 4;

export function jobTerms(jobText: string): Set<string> {
  const terms = new Set<string>();
  for (const word of jobText.toLowerCase().match(/[a-z][a-z0-9+#.]{3,}/g) ?? []) {
    const cleaned = word.replace(/\.$/, "");
    if (!STOPWORDS.has(cleaned)) terms.add(cleaned);
  }
  return terms;
}

function overlap(text: string, terms: Set<string>): number {
  const words = new Set((text.toLowerCase().match(/[a-z][a-z0-9+#.]{3,}/g) ?? []).map((w) => w.replace(/\.$/, "")));
  let count = 0;
  for (const word of words) {
    if (terms.has(word)) count++;
  }
  return count;
}

// Skills the job text names, in the profile's own wording. Only these are suggested.
export function skillsNamedInJob(jobText: string, profile: Profile): string[] {
  const lower = jobText.toLowerCase();
  return profile.skills
    .map((skill) => skill.name)
    .filter((name) => {
      const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-z0-9+#])${escaped}($|[^a-z0-9+#])`).test(lower);
    });
}

export function buildChecklist(jobText: string, profile: Profile): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  const named = skillsNamedInJob(jobText, profile);
  if (named.length > 0) {
    items.push({ kind: "lead-skill", skills: named });
  }

  const terms = jobTerms(jobText);
  const roles = [
    ...profile.experience.map((role) => ({ label: `${role.title}`, bullets: role.bullets })),
    ...profile.projects.map((project) => ({ label: project.name, bullets: project.bullets })),
  ];

  for (const role of roles) {
    const scored = role.bullets.map((bullet) => ({ bullet, score: overlap(bullet.text, terms) }));

    const first = scored[0];
    if (first !== undefined) {
      const better = scored.slice(1).reduce<(typeof scored)[number] | undefined>(
        (best, candidate) => (best === undefined || candidate.score > best.score ? candidate : best),
        undefined,
      );
      if (better !== undefined && better.score >= first.score + MOVE_UP_MARGIN) {
        items.push({ kind: "move-up", sourceId: better.bullet.id, text: better.bullet.text, role: role.label });
      }
    }

    if (scored.length >= MIN_BULLETS_BEFORE_TRIM) {
      const unrelated = scored.filter((entry) => entry.score === 0).slice(0, MAX_TRIM_CANDIDATES);
      for (const entry of unrelated) {
        items.push({ kind: "trim", sourceId: entry.bullet.id, text: entry.bullet.text, role: role.label });
      }
    }
  }

  return items;
}
