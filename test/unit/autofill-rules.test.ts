import { describe, expect, it } from "vitest";
import type { FieldDescriptor } from "../../src/autofill/fields";
import { classify, FILLABLE_KEYS } from "../../src/autofill/rules";

function field(overrides: Partial<FieldDescriptor>): FieldDescriptor {
  return {
    index: 0,
    tag: "input",
    type: "text",
    name: "",
    id: "",
    autocomplete: "",
    placeholder: "",
    ariaLabel: "",
    label: "",
    options: [],
    hasValue: false,
    ...overrides,
  };
}

describe("fill rules: what gets filled", () => {
  it.each([
    [{ label: "First name" }, "firstName"],
    [{ label: "Given name" }, "firstName"],
    [{ autocomplete: "given-name" }, "firstName"],
    [{ label: "Last name" }, "lastName"],
    [{ autocomplete: "family-name" }, "lastName"],
    [{ label: "Full name" }, "name"],
    [{ name: "name" }, "name"],
    [{ label: "Email address" }, "email"],
    [{ type: "email", name: "e-mail" }, "email"],
    [{ label: "Phone number" }, "phone"],
    [{ autocomplete: "tel" }, "phone"],
    [{ label: "City" }, "city"],
    [{ autocomplete: "address-level2" }, "city"],
    [{ placeholder: "LinkedIn profile URL" }, "linkedin"],
    [{ name: "github", ariaLabel: "GitHub username or URL" }, "github"],
    [{ placeholder: "Portfolio or personal website" }, "portfolio"],
    [{ label: "University" }, "school"],
    [{ label: "Degree" }, "degree"],
    [{ label: "Field of study" }, "field"],
  ])("maps %j to %s", (overrides, key) => {
    expect(classify(field(overrides))).toEqual({ kind: "fill", key });
  });

  it("maps resume uploads only, and only when the field is about a resume", () => {
    expect(classify(field({ type: "file", label: "Resume (PDF)" }))).toEqual({ kind: "fill", key: "resume" });
    expect(classify(field({ type: "file", label: "Cover letter" }))).toEqual({ kind: "never", reason: "file" });
  });

  it("never maps to a key outside the whitelist", () => {
    // Every key a rule can return must be on the whitelist.
    const samples = [
      "Email", "Phone", "City", "LinkedIn", "GitHub", "Portfolio", "University", "Degree",
      "Field of study", "First name", "Last name", "Full name",
    ];
    for (const label of samples) {
      const result = classify(field({ label }));
      if (result.kind === "fill") {
        expect(FILLABLE_KEYS).toContain(result.key);
      }
    }
  });
});

describe("fill rules: never filled", () => {
  it("never fills a password field, whatever its label", () => {
    expect(classify(field({ type: "password", label: "Email" }))).toEqual({ kind: "never", reason: "password" });
  });

  it.each<[Partial<FieldDescriptor>, string]>([
    [{ label: "Card number" }, "payment"],
    [{ autocomplete: "cc-number" }, "payment"],
    [{ label: "CVV" }, "payment"],
    [{ label: "Expiration date" }, "payment"],
    [{ label: "IBAN" }, "payment"],
    [{ label: "Bank account number" }, "payment"],
    [{ label: "Social Security Number" }, "government-id"],
    [{ label: "Aadhaar number" }, "government-id"],
    [{ label: "Passport number" }, "government-id"],
    [{ label: "Security question: name of your first pet" }, "security-question"],
    [{ label: "Mother's maiden name" }, "security-question"],
  ])("never fills %j (%s)", (overrides, reason) => {
    expect(classify(field(overrides))).toEqual({ kind: "never", reason });
  });
});

describe("fill rules: needs your answer", () => {
  it.each([
    "Gender",
    "Race or ethnicity",
    "Veteran status",
    "Disability status",
    "Pronouns",
  ])("treats %j as self-identification", (label) => {
    expect(classify(field({ label }))).toEqual({ kind: "needs-answer", reason: "self-identification" });
  });

  it.each([
    "Are you legally authorized to work in this country?",
    "Will you now or in the future require visa sponsorship?",
    "Have you ever been convicted of a felony?",
    "Do you consent to a background check?",
  ])("treats %j as a legal attestation", (label) => {
    expect(classify(field({ label }))).toEqual({ kind: "needs-answer", reason: "legal-attestation" });
  });
});

describe("fill rules: not the candidate's field", () => {
  it.each(["Company name", "Employer", "Reference name", "Hiring manager", "Project name", "Current company"])(
    "does not fill %j as the candidate's name, city, or school",
    (label) => {
      expect(classify(field({ label })).kind).not.toBe("fill");
    },
  );

  it("leaves unknown labels unclear, so they are left blank", () => {
    expect(classify(field({ label: "Cover letter" }))).toEqual({ kind: "unclear" });
  });
});
