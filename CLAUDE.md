# CLAUDE.md

Guidance for anyone (human or AI) changing this repository. The full plan is in `PLAN.md`.

## What this is

A public, open-source Chrome extension (Manifest V3) that scores job fit, autofills application forms from a local profile after confirmation, and tailors a resume without inventing facts. Users bring their own AI provider key.

## Principles (non-negotiable)

1. **No backend.** The extension calls the user's chosen provider directly with the user's own key. We never receive, proxy, or log user data.
2. **Local-first.** The profile, API key, and tracker live only in `chrome.storage.local`, encrypted in one vault. Nothing leaves the device except the minimum sent to the chosen provider.
3. **No telemetry, analytics, crash reporting, remote fonts, remote scripts, or third-party SDKs.**
4. **Never submit a form.** Autofill fills fields only. The user clicks submit. Autofill code must not call `click`, `submit`, or `requestSubmit`. A test enforces this.
5. **Never fabricate.** Tailored resume text may only rephrase or reorder profile facts. Each bullet needs a valid `sourceId`, and numbers and terms must come from the source.
6. **Untrusted page text.** Job pages are hostile. Use `textContent` or DOM APIs. Never `innerHTML`, `insertAdjacentHTML`, `eval`, or `new Function`. Lint enforces the first three.
7. **Strict CSP.** `script-src 'self'; object-src 'self'`. No inline scripts or event-handler attributes.
8. **Minimal permissions.** Only `activeTab`, `scripting`, `storage`, `sidePanel`. No `<all_urls>`. No `content_scripts`. The provider host is requested at runtime through `optional_host_permissions`.
9. **Logs contain only event codes and counts.** Use `logEvent` from `src/shared/log.ts`. Never log job text, profile values, or keys.
10. **No secrets or personal data in the repo.** `profile.json` and `.env*` are gitignored. The repo ships only `profile.example.json`, with fake data.

When a feature conflicts with privacy, choose privacy and say so in the final message.

## Commands

```bash
npm ci                  # install exact versions from the lockfile
npm run build           # bundle into dist/ (load dist/ unpacked in Chrome)
npm run lint            # ESLint, including the innerHTML/eval rules
npm run typecheck       # tsc --noEmit, strict
npm test                # Vitest unit and security tests
npm run check:bundle    # fails if shipped JS contains eval or new Function
npm run audit           # npm audit, high severity and above
npm run check           # lint, typecheck, test, build, and check:bundle together
```

## Working rules

- Work phase by phase (see `PLAN.md` section 7). Each phase ends with `npm run check` green and a summary of what changed and what is left.
- Keep `PRIVACY.md` and `README.md` accurate to the code. Update them in the same commit that changes data flow.
- Small, reviewable commits. Never commit personal data or keys.
- Do not add features beyond the phases in `PLAN.md` without asking.
- Dependencies: runtime is `zod` only, pinned exact. Adding a runtime dependency needs a reason in the commit message.
- Model output is data. Validate it with zod before use. It may be displayed, or used to fill whitelisted profile keys. It must never trigger navigation, clicks, submissions, or network calls.
- Passphrase, API key, and unlocked profile never leave the side panel page or options page. There is no background service worker that holds secrets.

## Layout

- `src/manifest.json`: the extension manifest. Its security policy is tested in `test/unit/manifest.test.ts`.
- `src/shared/vault/`: PBKDF2 and AES-GCM encryption, and the vault that holds the profile and API key.
- `src/shared/schemas/`: zod schemas. `profile.ts` is the profile schema.
- `src/shared/`: settings, auto-lock, logging, storage interface, shared UI helpers.
- `src/sidepanel/` and `src/options/`: the extension pages. `sidepanel/analyze.ts` is the Analyze flow.
- `src/shared/providers/`: provider adapters (Gemini, Anthropic) and the single `send()` that performs their requests.
- `src/shared/privacy/outgoing.ts`: scrubs and scans profile text before any send.
- `src/analysis/`: prompt building, output schemas (strict, zod), deterministic gates, verdict thresholds in `config.ts`, and the pipeline.
- `src/autofill/`: form scanning (`fields.ts`), the whitelist and deny rules (`rules.ts`), the preview plan (`plan.ts`), the page-side fill (`fill.ts`, the only file that dispatches events), and opt-in label mapping (`modelMap.ts`). `src/content/scanFields.ts` and `fillFields.ts` are their content-script entries.
- `src/resume/`: resume help. `checklist.ts` is keyword-only and needs no network. `suggestions.ts` is the optional AI step, with ids checked and rephrasings checked by `grounding.ts`. `handoff.ts` builds the prompt the user pastes into another chat. The extension never writes a resume.
- `src/jobs/extract.ts`: reads a job posting from a page (JSON-LD first, visible text otherwise, 15,000-character cap). `src/content/extractJob.ts` is its content-script entry, built as an IIFE.
- `test/unit/`: unit tests. `test/security/`: injection and no-action tests. `test/fixtures/`: sample pages. `test/helpers/`: test utilities.
- `scripts/check-bundle.mjs`: post-build check for `eval` and `new Function`.
