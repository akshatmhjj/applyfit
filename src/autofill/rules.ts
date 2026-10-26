import type { FieldDescriptor } from "./fields";

// The only profile keys autofill may ever fill. Anything else is refused by construction.
export const FILLABLE_KEYS = [
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "linkedin",
  "github",
  "portfolio",
  "school",
  "degree",
  "field",
  "resume",
] as const;
export type FieldKey = (typeof FILLABLE_KEYS)[number];

export type Classification =
  // Filled from the profile, after the user confirms.
  | { kind: "fill"; key: FieldKey }
  // Never filled, and shown to the user as skipped.
  | { kind: "never"; reason: NeverReason }
  // EEO self-identification and legal attestations. Shown as "needs your answer".
  | { kind: "needs-answer"; reason: "self-identification" | "legal-attestation" }
  // The rules did not decide. Only the optional model step may look at these.
  | { kind: "unclear" };

export type NeverReason = "password" | "payment" | "government-id" | "security-question" | "file";

// Whole-field text: every label-like attribute, lowercased, with separators flattened.
function textOf(field: FieldDescriptor): string {
  return [field.name, field.id, field.autocomplete, field.placeholder, field.ariaLabel, field.label]
    .join(" ")
    .toLowerCase()
    .replace(/[_\-.[\]]+/g, " ");
}

const PAYMENT = /\bcc\b|\bcc (number|csc|exp|expiration)|card number|credit card|debit card|\bcvv\b|\bcvc\b|security code|\bexpir|\biban\b|routing number|sort code|account number|\bbank\b/;
const GOVERNMENT_ID = /\bssn\b|social security|aadhaar|aadhar|\bpan (card|number)\b|passport|national id|government id|tax id|\bsin number\b/;
const SECURITY_QUESTION = /security question|mother s maiden|maiden name|first pet|name of your first|childhood/;
const RESUME = /\bresume\b|\bcv\b|curriculum vitae/;

const SELF_IDENTIFICATION = /\bgender\b|\brace\b|ethnic|veteran|disabilit|sexual orientation|\bpronouns?\b|lgbt|religio/;
const LEGAL_ATTESTATION = /authori[sz]ed to work|work authori[sz]ation|right to work|eligible to work|employment eligibility|\bvisa\b|sponsor|criminal|convicted|felony|background check|legally/;

// Words that mean the field is about the employer, a reference, or a different person.
// They block the generic keys (name, city, school, and so on), but not the specific ones
// such as github, where "GitHub username" is exactly the right field.
const NOT_CANDIDATE = /company|employer|employment|previous|organi[sz]ation|username|user name|nickname|reference|hiring|manager|project|\bfile\b/;
const GENERIC_KEYS = new Set<FieldKey>(["name", "firstName", "lastName", "city", "school", "degree", "field"]);

interface KeyRule {
  key: Exclude<FieldKey, "resume">;
  pattern: RegExp;
}

// Checked in order. firstName and lastName come before name, so "first name" is never
// mistaken for a full-name field.
const KEY_RULES: KeyRule[] = [
  { key: "email", pattern: /\be mail\b|\bemail\b/ },
  { key: "phone", pattern: /\bphone\b|\bmobile\b|\btelephone\b|\btel\b/ },
  { key: "linkedin", pattern: /linkedin/ },
  { key: "github", pattern: /github/ },
  { key: "portfolio", pattern: /portfolio|personal website|personal site|\bwebsite\b/ },
  { key: "firstName", pattern: /first name|given name|\bfname\b|forename/ },
  { key: "lastName", pattern: /last name|family name|surname|\blname\b/ },
  { key: "name", pattern: /\bfull name\b|\byour name\b|\bname\b/ },
  { key: "city", pattern: /\bcity\b|\btown\b/ },
  { key: "school", pattern: /\bschool\b|\buniversity\b|\bcollege\b|\binstitution\b/ },
  { key: "degree", pattern: /\bdegree\b/ },
  { key: "field", pattern: /field of study|\bmajor\b|discipline/ },
];

export function classify(field: FieldDescriptor): Classification {
  if (field.type === "password") return { kind: "never", reason: "password" };

  if (field.type === "file") {
    return RESUME.test(textOf(field)) ? { kind: "fill", key: "resume" } : { kind: "never", reason: "file" };
  }

  const text = textOf(field);
  if (PAYMENT.test(text) || field.autocomplete.toLowerCase().startsWith("cc-")) {
    return { kind: "never", reason: "payment" };
  }
  if (GOVERNMENT_ID.test(text)) return { kind: "never", reason: "government-id" };
  if (SECURITY_QUESTION.test(text)) return { kind: "never", reason: "security-question" };

  if (SELF_IDENTIFICATION.test(text)) return { kind: "needs-answer", reason: "self-identification" };
  if (LEGAL_ATTESTATION.test(text)) return { kind: "needs-answer", reason: "legal-attestation" };

  const byAutocomplete = keyFromAutocomplete(field.autocomplete);
  if (byAutocomplete !== null) return { kind: "fill", key: byAutocomplete };

  for (const rule of KEY_RULES) {
    if (GENERIC_KEYS.has(rule.key) && NOT_CANDIDATE.test(text)) continue;
    if (rule.pattern.test(text)) return { kind: "fill", key: rule.key };
  }
  return { kind: "unclear" };
}

function keyFromAutocomplete(value: string): FieldKey | null {
  switch (value.trim().toLowerCase()) {
    case "email":
      return "email";
    case "tel":
      return "phone";
    case "given-name":
      return "firstName";
    case "family-name":
      return "lastName";
    case "name":
      return "name";
    case "address-level2":
      return "city";
    default:
      return null;
  }
}

export function isFillableKey(value: string): value is FieldKey {
  return (FILLABLE_KEYS as readonly string[]).includes(value);
}
