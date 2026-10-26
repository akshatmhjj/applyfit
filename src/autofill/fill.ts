import { classify } from "./rules";
import { describeField, eligibleFields, fingerprintOf, type FieldDescriptor } from "./fields";

// What the side panel sends after the user confirms. Values are the profile text the user
// saw in the preview, and the resume bytes as base64.
export interface FillPayload {
  fingerprint: string;
  fills: { index: number; value: string }[];
  resume?: { index: number; name: string; mimeType: string; base64: string };
}

export type FillResult =
  | { status: "changed-page" }
  | { status: "resume-unsupported" }
  | { status: "done"; filled: number; skipped: number; resume: boolean };

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Fills the confirmed fields. It never submits, never clicks, and never follows a link.
// It refuses to run if the page's field list changed since the preview.
export function fillDocument(doc: Document, payload: FillPayload): FillResult {
  const elements = eligibleFields(doc);
  const fields = elements.map((el, index) => describeField(el, index, doc));
  if (fingerprintOf(fields) !== payload.fingerprint) {
    return { status: "changed-page" };
  }
  // Refuse before writing anything, so the result is never half a fill.
  if (payload.resume !== undefined && typeof DataTransfer === "undefined") {
    return { status: "resume-unsupported" };
  }

  let filled = 0;
  let skipped = 0;
  for (const fill of payload.fills) {
    const el = elements[fill.index];
    const field = fields[fill.index];
    // Re-check on the page side. Only text-like fields the rules mark as fillable are written.
    if (el === undefined || field === undefined) {
      skipped++;
      continue;
    }
    const decision = classify(field);
    if (decision.kind !== "fill" || decision.key === "resume") {
      skipped++;
      continue;
    }
    if (writeValue(el, fill.value)) {
      filled++;
    } else {
      skipped++;
    }
  }

  let resume = false;
  if (payload.resume !== undefined) {
    resume = attachResume(elements, fields, payload.resume) === "attached";
  }

  return { status: "done", filled, skipped, resume };
}

// Native setter plus input and change events, so React and similar frameworks see the value.
function writeValue(el: HTMLElement, value: string): boolean {
  if (el instanceof HTMLSelectElement) {
    const option = Array.from(el.options).find((candidate) => candidate.text.trim() === value);
    if (option === undefined) return false;
    el.value = option.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;

  const prototype = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter === undefined) return false;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function attachResume(
  elements: HTMLElement[],
  fields: FieldDescriptor[],
  resume: NonNullable<FillPayload["resume"]>,
): "attached" | "skipped" {
  const el = elements[resume.index];
  const field = fields[resume.index];
  if (el === undefined || field === undefined) return "skipped";
  const decision = classify(field);
  if (decision.kind !== "fill" || decision.key !== "resume") return "skipped";
  if (!(el instanceof HTMLInputElement) || el.type !== "file") return "skipped";
  // DataTransfer is how a file is handed to a page's file input without a file picker.

  const bytes = decodeBase64(resume.base64);
  if (bytes.length === 0 || bytes.length > MAX_RESUME_BYTES) return "skipped";
  const transfer = new DataTransfer();
  transfer.items.add(new File([bytes], resume.name, { type: resume.mimeType }));
  el.files = transfer.files;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return "attached";
}

function decodeBase64(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
