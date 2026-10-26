// Checks that suggested resume wording uses only facts that are already in the source bullet.
// A rephrase may reorder words, drop words, or change verbs. It may not add a number, a
// capitalised name or tool, a link, or an email address that the source does not contain.

const URL_OR_EMAIL = /https?:\/\/|www\.|\S+@\S+\.\S+/i;
const NUMBER = /\d+(?:\.\d+)?/g;
const WORD = /[A-Za-z0-9][A-Za-z0-9+#.]*/g;

export interface GroundingResult {
  ok: boolean;
  problems: string[];
}

function words(text: string): Set<string> {
  return new Set((text.match(WORD) ?? []).map((word) => word.toLowerCase().replace(/\.$/, "")));
}

// A term needs checking when it is an acronym, carries a digit or symbol (TypeScript is
// caught by the capital rule), or is capitalised and not the first word of the sentence.
// The first word is skipped because it is often a verb that a rephrase is allowed to change.
function termsToCheck(text: string): string[] {
  const tokens = text.match(WORD) ?? [];
  return tokens.filter((token, index) => {
    if (/[0-9+#]/.test(token)) return true;
    if (index === 0) return false;
    return /^[A-Z]/.test(token) || /^[A-Z]{2,}$/.test(token);
  });
}

export function checkGrounding(suggested: string, source: string): GroundingResult {
  const problems: string[] = [];
  if (URL_OR_EMAIL.test(suggested)) {
    problems.push("contains a link or email");
  }

  const sourceNumbers = new Set(source.match(NUMBER) ?? []);
  for (const number of suggested.match(NUMBER) ?? []) {
    if (!sourceNumbers.has(number)) {
      problems.push(`adds the number ${number}`);
    }
  }

  const sourceWords = words(source);
  for (const term of termsToCheck(suggested)) {
    const normalized = term.toLowerCase().replace(/\.$/, "");
    if (!sourceWords.has(normalized)) {
      problems.push(`adds the term "${term}"`);
    }
  }

  return { ok: problems.length === 0, problems };
}
