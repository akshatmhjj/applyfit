import type { JobExtraction } from "../jobs/extract";
import { buildChecklist, type ChecklistItem } from "../resume/checklist";
import { buildClaudePrompt } from "../resume/handoff";
import { runSuggestions, type Suggestion, type SuggestionOutcome } from "../resume/suggestions";
import { logEvent } from "../shared/log";
import type { Profile } from "../shared/schemas/profile";
import type { Settings } from "../shared/settings";
import { getProvider } from "../shared/providers/registry";
import { ensureProviderHost } from "../shared/providers/permission";
import { byId, setText } from "../shared/ui/dom";
import type { Vault } from "../shared/vault/vault";
import { extractFromActiveTab } from "./analyze";
import { askToSend, type ConfirmIds } from "./confirmSend";

const REQUEST_TIMEOUT_MS = 45_000;
const RESUME_CONFIRM: ConfirmIds = {
  panel: "resume-confirm",
  summary: "resume-confirm-summary",
  warning: "resume-confirm-warning",
  send: "resume-send",
  cancel: "resume-cancel",
};

// The job last read from the active tab, and the profile it was read with.
let lastJob: JobExtraction | null = null;

export async function onBuildChecklist(vault: Vault): Promise<void> {
  const profile = profileOrExplain(vault);
  if (profile === null) return;

  setStatus("Reading the job posting from the active tab…");
  let extraction: JobExtraction;
  try {
    extraction = await extractFromActiveTab();
  } catch {
    setStatus("Could not read this page. Open a job posting in the active tab and try again.");
    return;
  }
  if (extraction.text.trim() === "") {
    setStatus("The page has no readable job text.");
    return;
  }

  lastJob = extraction;
  const items = buildChecklist(extraction.text, profile);
  renderChecklist(items);
  logEvent("resume.checklist", { items: items.length });
  byId<HTMLButtonElement>("resume-ai").disabled = false;
  byId<HTMLButtonElement>("resume-copy").disabled = false;
  setStatus(
    "Checklist ready. It uses keyword matching only. Gaps and rewording need the AI suggestions or your judgement.",
  );
}

// The permission request is the first await, so it stays inside the click.
export async function onAiSuggestions(vault: Vault, settings: Settings): Promise<void> {
  const provider = getProvider(settings.provider);
  if (!(await ensureProviderHost(provider))) {
    setStatus(`Permission to contact ${provider.label} was not granted, so nothing was sent.`);
    return;
  }
  const profile = profileOrExplain(vault);
  const data = vault.read();
  if (profile === null || data.apiKey === null) {
    setStatus(data.apiKey === null ? `Add your ${provider.label} API key in Settings first.` : "Save a profile first.");
    return;
  }
  if (lastJob === null) {
    setStatus("Build the checklist first, so the job posting is read.");
    return;
  }

  const model = settings.models[settings.provider];
  const job = lastJob;
  const summary =
    `Send to ${provider.label} (model ${model}): ${job.text.length} characters of job posting text, ` +
    `and the ids and text of your bullet points and skills, so it can suggest changes. ` +
    "Contact details are not sent. Nothing in your resume changes unless you change it.";
  const warning =
    provider.id === "gemini"
      ? "Google's free tier may use these prompts to improve its products. Use a billed key to avoid that."
      : null;
  if (!(await askToSend(RESUME_CONFIRM, summary, warning))) {
    setStatus("Cancelled. Nothing was sent.");
    return;
  }

  setStatus(`Asking ${provider.label}…`);
  const outcome = await runSuggestions(job, profile, {
    provider,
    model,
    apiKey: data.apiKey,
    fetch: (input, init) => fetch(input, init),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  renderAiOutcome(outcome, profile);
}

export async function onCopyPrompt(vault: Vault): Promise<void> {
  const profile = profileOrExplain(vault);
  if (profile === null) return;
  if (lastJob === null) {
    setStatus("Build the checklist first, so the job posting is read.");
    return;
  }
  const prompt = buildClaudePrompt(lastJob.text, profile);
  try {
    await navigator.clipboard.writeText(prompt);
    logEvent("resume.copied");
    setStatus("Copied. Paste it into your Claude chat, then add your own contact header to the result.");
  } catch {
    setStatus("Could not copy to the clipboard. Try again after clicking inside the side panel.");
  }
}

function profileOrExplain(vault: Vault): Profile | null {
  const profile = vault.read().profile;
  if (profile === null || profile.skills.length === 0) {
    setStatus("Save a profile with at least one skill first.");
    return null;
  }
  return profile;
}

function renderChecklist(items: ChecklistItem[]): void {
  const list = byId("resume-checklist-list");
  list.replaceChildren();
  if (items.length === 0) {
    addItem(list, "Nothing stood out by keyword matching.");
    return;
  }
  for (const item of items) {
    switch (item.kind) {
      case "lead-skill":
        addItem(list, `Lead with these skills: ${item.skills.join(", ")}`);
        break;
      case "move-up":
        addItem(list, `Move up in ${item.role}: "${item.text}"`);
        break;
      case "trim":
        addItem(list, `Consider removing from ${item.role}: "${item.text}"`);
        break;
    }
  }
}

function renderAiOutcome(outcome: SuggestionOutcome, profile: Profile): void {
  const list = byId("resume-ai-list");
  list.replaceChildren();
  setText("resume-ai-note", "");

  switch (outcome.status) {
    case "no-job-text":
      setStatus("The job page had no readable text.");
      return;
    case "blocked":
      setStatus("Blocked before sending. Nothing was sent.");
      return;
    case "rejected":
      setStatus("The model's answer did not match the expected format, so it was rejected.");
      return;
    case "provider-error":
      setStatus(`The provider returned an error (${outcome.code}). Nothing was changed.`);
      return;
    case "ok": {
      logEvent("resume.suggestions", {
        accepted: outcome.checked.accepted.length,
        rejected: outcome.checked.rejected.length,
      });
      if (outcome.checked.accepted.length === 0) {
        addItem(list, "No suggestion passed the checks.");
      }
      for (const suggestion of outcome.checked.accepted) {
        addItem(list, describeSuggestion(suggestion, profile));
      }
      if (outcome.checked.rejected.length > 0) {
        setText(
          "resume-ai-note",
          `${outcome.checked.rejected.length} suggestion(s) were dropped: they pointed at unknown items or added facts the bullet does not contain.`,
        );
      }
      setStatus("Done. Review each change yourself. Nothing in your profile was changed.");
    }
  }
}

function describeSuggestion(suggestion: Suggestion, profile: Profile): string {
  const bullet = [...profile.experience.flatMap((r) => r.bullets), ...profile.projects.flatMap((p) => p.bullets)].find(
    (b) => b.id === suggestion.sourceId,
  );
  const skill = profile.skills.find((s) => s.id === suggestion.sourceId);
  switch (suggestion.action) {
    case "lead-skill":
      return `Lead with the skill "${skill?.name ?? ""}". ${suggestion.reason}`;
    case "move-up":
      return `Move up: "${bullet?.text ?? ""}". ${suggestion.reason}`;
    case "trim":
      return `Consider removing: "${bullet?.text ?? ""}". ${suggestion.reason}`;
    case "rephrase":
      return `Rephrase: "${bullet?.text ?? ""}" -> "${suggestion.suggestedText}". ${suggestion.reason}`;
  }
}

function addItem(list: HTMLElement, text: string): void {
  const item = document.createElement("li");
  item.textContent = text;
  list.append(item);
}

function setStatus(text: string): void {
  setText("resume-status", text);
}
