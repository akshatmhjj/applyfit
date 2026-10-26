// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fillDocument, type FillPayload } from "../../src/autofill/fill";
import { scanDocument } from "../../src/autofill/fields";
import { buildPlan, type PlanRow } from "../../src/autofill/plan";
import { classify } from "../../src/autofill/rules";
import { describeField } from "../../src/autofill/fields";
import { ProfileSchema, type Profile } from "../../src/shared/schemas/profile";
import { checkResumeBytes, EMPTY_VAULT_DATA, MAX_RESUME_BYTES, VaultDataSchema } from "../../src/shared/vault/vaultData";
import { contactValuesOf } from "../../src/analysis/prompt";

const PROFILE: Profile = ProfileSchema.parse({
  version: 1,
  contact: {
    name: "Alex Example",
    email: "alex@example.com",
    phone: "+1 555 0100 123",
    addressLine1: "12 Example Street",
    city: "Berlin",
    region: "Berlin",
    postalCode: "10115",
    country: "Germany",
    linkedin: "https://www.linkedin.com/in/alex-example",
  },
  preferences: { locations: [], remoteOk: true, needsVisaSponsorship: false },
  skills: [{ id: "s1", name: "TypeScript" }],
  experience: [],
  projects: [],
  education: [],
});

// Workday-style pages label fields with data-automation-id, not with names or ids.
function loadWorkday(): Document {
  return new DOMParser().parseFromString(readFileSync("test/fixtures/forms/workday-style.html", "utf8"), "text/html");
}

function rowFor(plan: PlanRow[], title: string): PlanRow {
  const row = plan.find((candidate) => candidate.title.includes(title));
  if (row === undefined) throw new Error(`no plan row for ${title}`);
  return row;
}

describe("Workday-style automation ids", () => {
  it("maps Workday legal name, address, contact, and country fields", () => {
    const doc = loadWorkday();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);

    expect(rowFor(plan, "First Name")).toMatchObject({ status: "fill", value: "Alex" });
    expect(plan.find((row) => row.status === "fill" && row.value === "Example")).toBeDefined();
  });

  it("maps every address field, and selects the country option that matches", () => {
    const doc = loadWorkday();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);
    const byId = (automationId: string) => {
      const field = scan.fields.find((f) => f.automationId === automationId);
      if (field === undefined) throw new Error(automationId);
      return plan.find((row) => row.index === field.index);
    };

    expect(byId("addressSection_addressLine1")).toMatchObject({ status: "fill", value: "12 Example Street" });
    expect(byId("addressSection_city")).toMatchObject({ status: "fill", value: "Berlin" });
    expect(byId("addressSection_region")).toMatchObject({ status: "fill", value: "Berlin" });
    expect(byId("addressSection_postalCode")).toMatchObject({ status: "fill", value: "10115" });
    expect(byId("addressSection_countryRegion")).toMatchObject({ status: "fill", value: "Germany" });
    expect(byId("email")).toMatchObject({ status: "fill", value: "alex@example.com" });
    expect(byId("phone-number")).toMatchObject({ status: "fill", value: "+1 555 0100 123" });
  });

  it("leaves address line 2 blank, because the profile has no second line", () => {
    const doc = loadWorkday();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);
    const line2 = scan.fields.find((f) => f.automationId === "addressSection_addressLine2");
    expect(plan.find((row) => row.index === line2?.index)?.status).toBe("blank");
  });

  it("never fills sponsorship or national-ID questions on a Workday page", () => {
    const doc = loadWorkday();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);
    const sponsorship = scan.fields.find((f) => f.automationId === "sponsorship");
    const ssn = scan.fields.find((f) => f.automationId === "ssnSection");
    expect(plan.find((row) => row.index === sponsorship?.index)?.status).toBe("needs-answer");
    expect(plan.find((row) => row.index === ssn?.index)?.status).toBe("skipped");
  });

  it("fills the Workday page, and writes the address through the page-side check", () => {
    const doc = loadWorkday();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);
    const fills = plan
      .filter((row) => row.status === "fill" && row.value !== undefined && !row.replacesText && row.key !== "resume")
      .map((row) => ({ index: row.index, value: row.value ?? "" }));
    const result = fillDocument(doc, { fingerprint: scan.fingerprint, fills } satisfies FillPayload);
    expect(result).toMatchObject({ status: "done" });
    const street = doc.querySelector('[data-automation-id="addressSection_addressLine1"]') as HTMLInputElement;
    expect(street.value).toBe("12 Example Street");
    const country = doc.querySelector('[data-automation-id="addressSection_countryRegion"]') as HTMLSelectElement;
    expect(country.value).toBe("de");
  });
});

describe("fill rules: address keys", () => {
  it.each<[Record<string, string>, string]>([
    [{ automationId: "addressSection_addressLine1" }, "addressLine1"],
    [{ label: "Street address" }, "addressLine1"],
    [{ autocomplete: "address-line1" }, "addressLine1"],
    [{ label: "Postal code" }, "postalCode"],
    [{ label: "ZIP code" }, "postalCode"],
    [{ autocomplete: "postal-code" }, "postalCode"],
    [{ label: "State or province" }, "region"],
    [{ autocomplete: "address-level1" }, "region"],
    [{ label: "Country" }, "country"],
    [{ autocomplete: "country-name" }, "country"],
  ])("maps %j to %s", (overrides, key) => {
    const base = describeField(document.createElement("input"), 0, document);
    expect(classify({ ...base, ...overrides, tag: "input", type: "text" })).toEqual({ kind: "fill", key });
  });

  it.each<Record<string, string>>([
    { label: "Address line 2" },
    { label: "Apartment, suite, unit" },
    { label: "Email address" },
    { label: "IP address" },
    { label: "Company address" },
  ])("does not map %j to the street address", (overrides) => {
    const base = describeField(document.createElement("input"), 0, document);
    const result = classify({ ...base, ...overrides, tag: "input", type: "text" });
    expect(result).not.toEqual({ kind: "fill", key: "addressLine1" });
  });
});

describe("default resume storage", () => {
  it("accepts a PDF within the limit", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 minimal");
    expect(checkResumeBytes(pdf)).toBeNull();
  });

  it("refuses a file that is not a PDF", () => {
    expect(checkResumeBytes(new TextEncoder().encode("Plain text resume"))).toBe("That file is not a PDF.");
  });

  it("refuses an empty file and a file over the limit", () => {
    expect(checkResumeBytes(new Uint8Array(0))).toBe("The file is empty.");
    const big = new Uint8Array(MAX_RESUME_BYTES + 1);
    big.set([0x25, 0x50, 0x44, 0x46]);
    expect(checkResumeBytes(big)).toMatch(/larger than 2 MB/);
  });

  it("stores the resume in the vault data shape, and allows none", () => {
    expect(VaultDataSchema.safeParse(EMPTY_VAULT_DATA).success).toBe(true);
    const withResume = {
      ...EMPTY_VAULT_DATA,
      resume: { name: "cv.pdf", mimeType: "application/pdf", base64: "JVBERg==", uploadedAt: "2026-10-26T00:00:00Z" },
    };
    expect(VaultDataSchema.safeParse(withResume).success).toBe(true);
  });

  it("rejects a resume with a different mime type", () => {
    const bad = {
      ...EMPTY_VAULT_DATA,
      resume: { name: "cv.docx", mimeType: "application/msword", base64: "AAAA", uploadedAt: "2026-10-26" },
    };
    expect(VaultDataSchema.safeParse(bad).success).toBe(false);
  });
});

describe("address details are contact details", () => {
  it("are scrubbed from model requests, like email and phone", () => {
    const values = contactValuesOf(PROFILE);
    expect(values).toContain("12 Example Street");
    expect(values).toContain("10115");
  });
});
