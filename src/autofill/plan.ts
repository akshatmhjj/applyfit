import type { Profile } from "../shared/schemas/profile";
import type { FieldDescriptor } from "./fields";
import { classify, type FieldKey, type Classification } from "./rules";

export type RowStatus = "fill" | "needs-answer" | "skipped" | "blank";

export interface PlanRow {
  index: number;
  // What the user sees for this field: its label, or its name, capped.
  title: string;
  status: RowStatus;
  // Why the row is not filled, in plain words.
  reason: string;
  key?: FieldKey;
  // Text to fill. For selects, the option text to choose.
  value?: string;
  // The field already has text. Filling replaces it, so the UI leaves these unchecked.
  replacesText: boolean;
  tag: FieldDescriptor["tag"];
  type: string;
}

const NEVER_TEXT: Record<string, string> = {
  password: "Passwords are never filled.",
  payment: "Payment details are never filled.",
  "government-id": "Government ID numbers are never filled.",
  "security-question": "Security questions are never filled.",
  file: "File uploads are only used for your resume.",
};

const NEEDS_ANSWER_TEXT: Record<"self-identification" | "legal-attestation", string> = {
  "self-identification": "Self-identification questions need your answer.",
  "legal-attestation": "Legal and work-authorisation questions need your answer.",
};

// First name is the first word of the full name. Last name is the rest.
export function valueFor(key: FieldKey, profile: Profile): string | null {
  const contact = profile.contact;
  const education = profile.education[0];
  const nameParts = (contact.name ?? "").split(/\s+/).filter((part) => part !== "");

  const value = (() => {
    switch (key) {
      case "name":
        return contact.name ?? null;
      case "firstName":
        return nameParts[0] ?? null;
      case "lastName":
        return nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
      case "email":
        return contact.email ?? null;
      case "phone":
        return contact.phone ?? null;
      case "addressLine1":
        return contact.addressLine1 ?? null;
      case "city":
        return contact.city ?? null;
      case "region":
        return contact.region ?? null;
      case "postalCode":
        return contact.postalCode ?? null;
      case "country":
        return contact.country ?? null;
      case "linkedin":
        return contact.linkedin ?? null;
      case "github":
        return contact.github ?? null;
      case "portfolio":
        return contact.portfolio ?? null;
      case "school":
        return education?.school ?? null;
      case "degree":
        return education?.degree ?? null;
      case "field":
        return education?.field ?? null;
      case "resume":
        return null;
    }
  })();
  return value === null || value.trim() === "" ? null : value.trim();
}

// Builds the preview. Nothing here touches the page.
// modelKeys carries the optional model-assisted mapping for fields the rules did not decide.
export function buildPlan(
  fields: FieldDescriptor[],
  profile: Profile,
  modelKeys: ReadonlyMap<number, FieldKey> = new Map(),
): PlanRow[] {
  return fields.map((field) => {
    const base = { index: field.index, title: titleOf(field), replacesText: field.hasValue, tag: field.tag, type: field.type };
    const classification: Classification = classify(field);

    if (classification.kind === "never") {
      return { ...base, status: "skipped", reason: NEVER_TEXT[classification.reason] ?? "Skipped.", replacesText: false };
    }
    if (classification.kind === "needs-answer") {
      return { ...base, status: "needs-answer", reason: NEEDS_ANSWER_TEXT[classification.reason], replacesText: false };
    }

    const key = classification.kind === "fill" ? classification.key : modelKeys.get(field.index);
    if (key === undefined) {
      return { ...base, status: "blank", reason: "No matching profile field, so it is left blank.", replacesText: false };
    }
    if (key === "resume") {
      return { ...base, status: "fill", key, reason: "Upload your resume PDF.", replacesText: false };
    }

    const wanted = valueFor(key, profile);
    if (wanted === null) {
      return { ...base, status: "blank", reason: "Your profile has no value for this field.", replacesText: false };
    }

    if (field.tag === "select") {
      const option = field.options.find((text) => text.toLowerCase() === wanted.toLowerCase());
      if (option === undefined) {
        return { ...base, status: "blank", reason: "No option in this list matches your profile.", replacesText: false };
      }
      return { ...base, status: "fill", key, value: option, reason: "" };
    }

    return { ...base, status: "fill", key, value: wanted, reason: "" };
  });
}

function titleOf(field: FieldDescriptor): string {
  const text = field.label || field.ariaLabel || field.placeholder || field.name || field.id || field.type;
  return text.slice(0, 80);
}
