// Last line of defense before profile text leaves the device. Profile text is scrubbed
// (emails, URLs, phone numbers, and the user's own contact values are replaced), then
// scanned again. Any remaining match blocks the call. Job text is not user data and is
// not scanned.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|dev|me|co|in|app|ai)(?:\/\S*)?/gi;
const PHONE = /(?:\+?\d[\s().-]?){9,}\d/g;
const REMOVED = "[removed]";

const PATTERNS: { code: string; pattern: RegExp }[] = [
  { code: "email", pattern: EMAIL },
  { code: "url", pattern: URL },
  { code: "phone", pattern: PHONE },
];

// Contact values shorter than this are too common to be a useful signal, and
// scrubbing them would mangle ordinary words.
const MIN_CONTACT_LENGTH = 4;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrubProfileText(text: string, contactValues: readonly string[]): string {
  let scrubbed = text;
  for (const value of contactValues) {
    if (value.length < MIN_CONTACT_LENGTH) continue;
    scrubbed = scrubbed.replace(new RegExp(escapeRegExp(value), "gi"), REMOVED);
  }
  for (const { pattern } of PATTERNS) {
    scrubbed = scrubbed.replace(pattern, REMOVED);
  }
  return scrubbed;
}

// Returns the kinds of sensitive text still present. An empty array means the text may be sent.
export function findSensitive(text: string, contactValues: readonly string[]): string[] {
  const findings: string[] = [];
  for (const { code, pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push(code);
    pattern.lastIndex = 0;
  }
  for (const value of contactValues) {
    if (value.length >= MIN_CONTACT_LENGTH && new RegExp(escapeRegExp(value), "i").test(text)) {
      findings.push("contact-value");
      break;
    }
  }
  return findings;
}
