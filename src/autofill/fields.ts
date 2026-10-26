// Finds the form fields on a page and describes them as plain data. This runs inside the
// page (via the scan content script) and in unit tests. Nothing here changes the page.
// Labels, names, and options are untrusted page text and are only ever read as text.

export interface FieldDescriptor {
  // Position among the eligible fields. Stable for the same page state.
  index: number;
  tag: "input" | "textarea" | "select";
  type: string;
  name: string;
  id: string;
  autocomplete: string;
  placeholder: string;
  ariaLabel: string;
  label: string;
  // Select fields only: visible option texts, capped.
  options: string[];
  // Not part of the fingerprint, because the user may type between scan and fill.
  hasValue: boolean;
}

const TEXT_TYPES = new Set(["", "text", "email", "tel", "url", "search", "password"]);
const MAX_TEXT = 200;
const MAX_OPTIONS = 100;
const MAX_OPTION_TEXT = 100;

export function eligibleFields(doc: Document): HTMLElement[] {
  return Array.from(doc.querySelectorAll<HTMLElement>("input, textarea, select")).filter((el) =>
    isEligible(el, doc),
  );
}

function isEligible(el: HTMLElement, doc: Document): boolean {
  if (el.closest('[hidden], [aria-hidden="true"]') !== null) return false;
  if (doc.defaultView?.getComputedStyle(el).display === "none") return false;
  const control = el as HTMLInputElement;
  if (control.disabled || control.readOnly) return false;
  if (el instanceof HTMLInputElement) {
    return el.type === "file" || TEXT_TYPES.has(el.type);
  }
  return true;
}

export function describeField(el: HTMLElement, index: number, doc: Document): FieldDescriptor {
  const tag = el.tagName.toLowerCase() as FieldDescriptor["tag"];
  const control = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const type = tag === "input" ? (control as HTMLInputElement).type : tag;
  const options =
    el instanceof HTMLSelectElement
      ? Array.from(el.options)
          .slice(0, MAX_OPTIONS)
          .map((option) => clip(option.text.trim(), MAX_OPTION_TEXT))
      : [];
  return {
    index,
    tag,
    type,
    name: clip(control.getAttribute("name") ?? "", MAX_TEXT),
    id: clip(control.id, MAX_TEXT),
    autocomplete: clip(control.getAttribute("autocomplete") ?? "", MAX_TEXT),
    placeholder: clip(control.getAttribute("placeholder") ?? "", MAX_TEXT),
    ariaLabel: clip(control.getAttribute("aria-label") ?? "", MAX_TEXT),
    label: clip(labelText(el, doc), MAX_TEXT),
    options,
    hasValue: "value" in control && control.value.trim() !== "",
  };
}

export function scanDocument(doc: Document): { fingerprint: string; fields: FieldDescriptor[]; elements: HTMLElement[] } {
  const elements = eligibleFields(doc);
  const fields = elements.map((el, index) => describeField(el, index, doc));
  return { fingerprint: fingerprintOf(fields), fields, elements };
}

// Identifies the page's field list. Fill refuses to run if this changed since the preview.
export function fingerprintOf(fields: FieldDescriptor[]): string {
  const stable = fields.map((field) => ({
    index: field.index,
    tag: field.tag,
    type: field.type,
    name: field.name,
    id: field.id,
    autocomplete: field.autocomplete,
    placeholder: field.placeholder,
    ariaLabel: field.ariaLabel,
    label: field.label,
    options: field.options,
  }));
  return fnv1a(JSON.stringify(stable));
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function labelText(el: HTMLElement, doc: Document): string {
  const parts: string[] = [];
  if (el.id !== "") {
    for (const label of Array.from(doc.getElementsByTagName("label"))) {
      if (label.htmlFor === el.id) parts.push(label.textContent ?? "");
    }
  }
  const wrapping = el.closest("label");
  if (wrapping !== null) parts.push(wrapping.textContent ?? "");

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy !== null) {
    for (const id of labelledBy.split(/\s+/)) {
      const target = doc.getElementById(id);
      if (target !== null) parts.push(target.textContent ?? "");
    }
  }
  return parts.map(normalize).filter((part) => part !== "").join(" ");
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, max: number): string {
  return normalize(text).slice(0, max);
}
