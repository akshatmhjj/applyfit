import { z } from "zod";

// Every experience, project, bullet, skill, and education entry has a stable id.
// Phase 4 uses bullet ids as sourceIds, so they must never be reused or renumbered.
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "ids use letters, digits, '-' or '_'");
const Text = (max: number) => z.string().trim().max(max);
const RequiredText = (max: number) => Text(max).min(1);

const Bullet = z.strictObject({
  id: Id,
  text: RequiredText(500),
});

export const ProfileSchema = z
  .strictObject({
    version: z.literal(1),
    contact: z.strictObject({
      name: Text(120).optional(),
      email: Text(254).optional(),
      phone: Text(40).optional(),
      // Address details are contact details: they are scrubbed from every model request.
      addressLine1: Text(200).optional(),
      city: Text(120).optional(),
      region: Text(120).optional(),
      postalCode: Text(20).optional(),
      country: Text(120).optional(),
      linkedin: Text(300).optional(),
      github: Text(300).optional(),
      portfolio: Text(300).optional(),
    }),
    preferences: z.strictObject({
      locations: z.array(RequiredText(120)).max(50),
      remoteOk: z.boolean(),
      needsVisaSponsorship: z.boolean(),
    }),
    skills: z
      .array(
        z.strictObject({
          id: Id,
          name: RequiredText(80),
          years: z.number().min(0).max(60).optional(),
        }),
      )
      .max(300),
    experience: z
      .array(
        z.strictObject({
          id: Id,
          company: RequiredText(120),
          title: RequiredText(120),
          start: Text(20),
          end: Text(20).optional(),
          bullets: z.array(Bullet).max(50),
        }),
      )
      .max(50),
    projects: z
      .array(
        z.strictObject({
          id: Id,
          name: RequiredText(120),
          url: Text(300).optional(),
          bullets: z.array(Bullet).max(50),
        }),
      )
      .max(50),
    education: z
      .array(
        z.strictObject({
          id: Id,
          school: RequiredText(120),
          degree: RequiredText(120),
          field: Text(120).optional(),
          year: Text(20).optional(),
        }),
      )
      .max(20),
  })
  .superRefine((profile, ctx) => {
    const seen = new Set<string>();
    const add = (id: string, path: (string | number)[]) => {
      if (seen.has(id)) {
        ctx.addIssue({ code: "custom", message: `duplicate id "${id}"`, path });
      }
      seen.add(id);
    };
    profile.skills.forEach((s, i) => add(s.id, ["skills", i, "id"]));
    profile.experience.forEach((e, i) => {
      add(e.id, ["experience", i, "id"]);
      e.bullets.forEach((b, j) => add(b.id, ["experience", i, "bullets", j, "id"]));
    });
    profile.projects.forEach((p, i) => {
      add(p.id, ["projects", i, "id"]);
      p.bullets.forEach((b, j) => add(b.id, ["projects", i, "bullets", j, "id"]));
    });
    profile.education.forEach((e, i) => add(e.id, ["education", i, "id"]));
  });

export type Profile = z.infer<typeof ProfileSchema>;
export type Preferences = Profile["preferences"];

export const BLANK_PROFILE: Profile = {
  version: 1,
  contact: {},
  preferences: { locations: [], remoteOk: false, needsVisaSponsorship: false },
  skills: [],
  experience: [],
  projects: [],
  education: [],
};

export type ProfileParseResult =
  | { ok: true; profile: Profile }
  | { ok: false; errors: string[] };

// Error messages name the field path only, never the value, so they are safe to log.
export function parseProfileJson(text: string): ProfileParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["Not valid JSON."] };
  }
  const result = ProfileSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, profile: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${where}: ${issue.message}`;
    }),
  };
}
