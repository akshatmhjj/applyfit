// The only logging path in the extension. It accepts a fixed event code and numeric
// counts, so job text, profile values, and API keys cannot reach the console by accident.
export type LogCode =
  | "vault.created"
  | "vault.unlocked"
  | "vault.unlock_failed"
  | "vault.locked"
  | "vault.auto_locked"
  | "vault.passphrase_changed"
  | "profile.saved"
  | "profile.invalid"
  | "settings.saved"
  | "apikey.saved"
  | "apikey.removed"
  | "analyze.started"
  | "analyze.declined"
  | "analyze.blocked"
  | "analyze.rejected"
  | "analyze.provider_error"
  | "analyze.done"
  | "provider.permission_denied"
  | "autofill.scanned"
  | "autofill.model_mapped"
  | "autofill.filled"
  | "autofill.changed_page"
  | "resume.checklist"
  | "resume.suggestions"
  | "resume.copied";

export function logEvent(code: LogCode, counts: Record<string, number> = {}): void {
  console.info(JSON.stringify({ code, counts }));
}
