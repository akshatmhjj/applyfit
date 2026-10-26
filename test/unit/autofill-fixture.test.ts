// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { scanDocument } from "../../src/autofill/fields";
import { buildPlan, type PlanRow } from "../../src/autofill/plan";
import { fillDocument, type FillPayload } from "../../src/autofill/fill";
import { ProfileSchema, type Profile } from "../../src/shared/schemas/profile";

const PROFILE: Profile = ProfileSchema.parse({
  version: 1,
  contact: {
    name: "Alex Example",
    email: "alex@example.com",
    phone: "+1 555 0100 123",
    city: "Springfield",
    linkedin: "https://www.linkedin.com/in/alex-example",
    github: "https://github.com/alex-example",
    portfolio: "https://alex.example.com",
  },
  preferences: { locations: [], remoteOk: true, needsVisaSponsorship: false },
  skills: [{ id: "s1", name: "TypeScript" }],
  experience: [],
  projects: [],
  education: [{ id: "e1", school: "Example University", degree: "B.Sc.", field: "Computer Science" }],
});

function loadForm(): Document {
  return new DOMParser().parseFromString(readFileSync("test/fixtures/forms/application.html", "utf8"), "text/html");
}

function rowFor(plan: PlanRow[], title: string): PlanRow {
  const row = plan.find((candidate) => candidate.title.includes(title));
  if (row === undefined) throw new Error(`no plan row for ${title}`);
  return row;
}

function payloadFrom(plan: PlanRow[], fingerprint: string): FillPayload {
  return {
    fingerprint,
    fills: plan
      .filter((row) => row.status === "fill" && row.value !== undefined && !row.replacesText)
      .map((row) => ({ index: row.index, value: row.value ?? "" })),
  };
}

describe("autofill plan on the application fixture", () => {
  const doc = loadForm();
  const scan = scanDocument(doc);
  const plan = buildPlan(scan.fields, PROFILE);

  it("fills the candidate fields from the profile", () => {
    expect(rowFor(plan, "First name")).toMatchObject({ status: "fill", value: "Alex" });
    expect(rowFor(plan, "Last name")).toMatchObject({ status: "fill", value: "Example" });
    expect(rowFor(plan, "Email")).toMatchObject({ status: "fill", value: "alex@example.com" });
    expect(rowFor(plan, "City")).toMatchObject({ status: "fill", value: "Springfield" });
    expect(rowFor(plan, "University")).toMatchObject({ status: "fill", value: "Example University" });
  });

  it("matches the select option to the profile degree", () => {
    expect(rowFor(plan, "Degree")).toMatchObject({ status: "fill", value: "B.Sc." });
  });

  it("warns, and does not fill by default, when a field already has text", () => {
    const row = rowFor(plan, "Phone (already typed)");
    expect(row).toMatchObject({ status: "fill", replacesText: true });
  });

  it("skips passwords, payment, government ID, and security questions", () => {
    for (const title of ["Create a password", "Card number", "Social Security Number", "first pet"]) {
      expect(rowFor(plan, title).status).toBe("skipped");
    }
  });

  it("marks self-identification and legal questions as needs-your-answer", () => {
    expect(rowFor(plan, "Gender").status).toBe("needs-answer");
    expect(rowFor(plan, "visa sponsorship").status).toBe("needs-answer");
  });

  it("leaves a field blank when the profile has nothing for it", () => {
    expect(rowFor(plan, "Current company").status).toBe("blank");
    expect(rowFor(plan, "Cover letter").status).toBe("blank");
  });

  it("offers the resume upload as a fill row", () => {
    expect(rowFor(plan, "Resume").status).toBe("fill");
  });
});

describe("autofill fill step", () => {
  it("writes only the confirmed values, and leaves every other field alone", () => {
    const doc = loadForm();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);
    const result = fillDocument(doc, payloadFrom(plan, scan.fingerprint));

    expect(result).toMatchObject({ status: "done" });
    expect((doc.querySelector('input[name="first_name"]') as HTMLInputElement).value).toBe("Alex");
    expect((doc.querySelector('input[name="email"]') as HTMLInputElement).value).toBe("alex@example.com");
    expect((doc.querySelector('select[name="degree"]') as HTMLSelectElement).value).toBe("bsc");

    // Never touched: password, card, SSN, security answer, EEO, visa, cover letter,
    // hidden and disabled fields, and the already-typed phone.
    for (const name of ["password", "cc-number", "ssn", "security_answer", "gender", "visa", "cover_letter", "hidden_email", "locked_name"]) {
      const el = doc.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      expect(el.value, name).toBe("");
    }
    expect((doc.querySelector('input[name="phone_2"]') as HTMLInputElement).value).toBe("+1 000 0000");
    expect((doc.querySelector('input[name="csrf"]') as HTMLInputElement).value).toBe("token-123");
  });

  it("dispatches input and change events so framework state updates", () => {
    const doc = loadForm();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);
    const email = doc.querySelector('input[name="email"]') as HTMLInputElement;
    const onInput = vi.fn();
    const onChange = vi.fn();
    email.addEventListener("input", onInput);
    email.addEventListener("change", onChange);

    fillDocument(doc, payloadFrom(plan, scan.fingerprint));
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("never submits the form or clicks a button", () => {
    const doc = loadForm();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);
    const form = doc.getElementById("apply") as HTMLFormElement;
    const button = doc.getElementById("submit-btn") as HTMLButtonElement;
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    const onClick = vi.fn();
    form.addEventListener("submit", onSubmit);
    button.addEventListener("click", onClick);

    fillDocument(doc, payloadFrom(plan, scan.fingerprint));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("refuses to fill when the page changed after the preview", () => {
    const doc = loadForm();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);
    const extra = doc.createElement("input");
    extra.name = "injected_after_preview";
    doc.querySelector("form")?.append(extra);

    const result = fillDocument(doc, payloadFrom(plan, scan.fingerprint));
    expect(result).toEqual({ status: "changed-page" });
    expect((doc.querySelector('input[name="first_name"]') as HTMLInputElement).value).toBe("");
  });

  it("re-checks each field on the page side, so a forged index cannot fill a password", () => {
    const doc = loadForm();
    const scan = scanDocument(doc);
    const passwordIndex = scan.fields.find((field) => field.type === "password")?.index ?? -1;
    const payload: FillPayload = {
      fingerprint: scan.fingerprint,
      fills: [{ index: passwordIndex, value: "attacker-chosen" }],
    };
    fillDocument(doc, payload);
    expect((doc.querySelector('input[name="password"]') as HTMLInputElement).value).toBe("");
  });

  it("reports resume-unsupported before writing anything when DataTransfer is missing", () => {
    const doc = loadForm();
    const scan = scanDocument(doc);
    const plan = buildPlan(scan.fields, PROFILE);
    const resumeIndex = scan.fields.find((field) => field.type === "file")?.index ?? -1;
    const payload: FillPayload = {
      ...payloadFrom(plan, scan.fingerprint),
      resume: { index: resumeIndex, name: "resume.pdf", mimeType: "application/pdf", base64: "JVBERg==" },
    };
    // jsdom has no DataTransfer, which is exactly the situation this guard is for.
    expect(typeof DataTransfer).toBe("undefined");
    const result = fillDocument(doc, payload);
    expect(result).toEqual({ status: "resume-unsupported" });
    expect((doc.querySelector('input[name="first_name"]') as HTMLInputElement).value).toBe("");
  });
});
