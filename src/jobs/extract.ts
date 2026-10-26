// Turns a job posting page into plain text for the model. The page is hostile:
// everything here is treated as untrusted data and only ever read as text.
// This file runs inside the page (via the content script) and in unit tests.

export const MAX_JOB_CHARS = 15_000;

export interface JobExtraction {
  method: "json-ld" | "visible-text";
  text: string;
  truncated: boolean;
}

const JOB_POSTING = "JobPosting";
const MAIN_MIN_CHARS = 500;
const NEVER_READ = "script, style, noscript, template, iframe, svg, nav, footer, header, button";
const HIDDEN = '[hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"]';

export function extractJob(doc: Document): JobExtraction {
  const fromJsonLd = jobFromJsonLd(doc);
  const extraction = fromJsonLd ?? { method: "visible-text" as const, text: visibleText(doc) };
  return capText(extraction);
}

function capText(extraction: Omit<JobExtraction, "truncated">): JobExtraction {
  if (extraction.text.length <= MAX_JOB_CHARS) {
    return { ...extraction, truncated: false };
  }
  return { ...extraction, text: extraction.text.slice(0, MAX_JOB_CHARS), truncated: true };
}

// JobPosting structured data is the most reliable source when a page has it.
function jobFromJsonLd(doc: Document): Omit<JobExtraction, "truncated"> | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const parsed = parseJson(script.textContent ?? "");
    for (const candidate of flattenJsonLd(parsed)) {
      if (isJobPosting(candidate)) {
        return { method: "json-ld", text: jobPostingText(candidate) };
      }
    }
  }
  return null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const record = value as Record<string, unknown>;
  const graph = Array.isArray(record["@graph"]) ? flattenJsonLd(record["@graph"]) : [];
  return [record, ...graph];
}

function isJobPosting(record: Record<string, unknown>): boolean {
  const type = record["@type"];
  return type === JOB_POSTING || (Array.isArray(type) && type.includes(JOB_POSTING));
}

function jobPostingText(job: Record<string, unknown>): string {
  const lines: string[] = [];
  const title = stringField(job.title);
  if (title) lines.push(`Title: ${title}`);

  const location = jobLocation(job.jobLocation);
  if (location) lines.push(`Location: ${location}`);

  const workplace = stringField(job.jobLocationType);
  if (workplace) lines.push(`Workplace: ${workplace}`);

  const employment = stringField(job.employmentType);
  if (employment) lines.push(`Employment type: ${employment}`);

  const description = stringField(job.description);
  if (description) {
    lines.push("Description:", htmlToText(description));
  }
  return lines.join("\n");
}

function jobLocation(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "object" || first === null) return "";
  const address = (first as Record<string, unknown>).address;
  if (typeof address !== "object" || address === null) return "";
  const parts = ["addressLocality", "addressRegion", "addressCountry"]
    .map((key) => stringField((address as Record<string, unknown>)[key]))
    .filter((part) => part !== "");
  return parts.join(", ");
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Job descriptions in JSON-LD are often HTML. DOMParser does not run scripts,
// and only textContent is read from the result.
function htmlToText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return normalizeWhitespace(parsed.body?.textContent ?? "");
}

function visibleText(doc: Document): string {
  const main = doc.querySelector("main, [role='main'], article");
  const root = main && (main.textContent ?? "").length >= MAIN_MIN_CHARS ? main : doc.body;
  if (!root) return "";

  const copy = root.cloneNode(true) as HTMLElement;
  for (const element of copy.querySelectorAll(NEVER_READ)) element.remove();
  for (const element of copy.querySelectorAll(HIDDEN)) element.remove();
  return normalizeWhitespace(copy.textContent ?? "");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
