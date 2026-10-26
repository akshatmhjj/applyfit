import { buildAnalysisRequest, contactValuesOf, scanProfileText } from "../analysis/prompt";
import { runAnalysis, type AnalysisOutcome } from "../analysis/pipeline";
import { VERDICT_LABEL } from "../analysis/verdict";
import type { JobExtraction } from "../jobs/extract";
import { logEvent } from "../shared/log";
import type { Settings } from "../shared/settings";
import type { Profile } from "../shared/schemas/profile";
import { getProvider } from "../shared/providers/registry";
import { ensureProviderHost } from "../shared/providers/permission";
import type { ProviderAdapter } from "../shared/providers/provider";
import { byId, setText } from "../shared/ui/dom";
import type { Vault } from "../shared/vault/vault";

const REQUEST_TIMEOUT_MS = 45_000;

// Pass 1 runs in the page (see src/content/extractJob.ts). Pass 2 reads the global it set.
const EXTRACT_FILE = "content/extractJob.js";

interface Preflight {
  provider: ProviderAdapter;
  model: string;
  apiKey: string;
  profile: Profile;
  extraction: JobExtraction;
}

// Click handler. The permission request is the first await, so it stays inside the click.
export async function onAnalyzeClick(vault: Vault, settings: Settings): Promise<void> {
  const provider = getProvider(settings.provider);
  setStatus("Checking permission…");
  const granted = await ensureProviderHost(provider);
  if (!granted) {
    logEvent("provider.permission_denied");
    setStatus(`Permission to contact ${provider.label} was not granted, so nothing was sent.`);
    return;
  }

  setStatus("Reading the job posting from the active tab…");
  let extraction: JobExtraction;
  try {
    extraction = await extractFromActiveTab();
  } catch {
    setStatus("Could not read this page. Open a job posting in the active tab and try again.");
    return;
  }

  const preflight = readyOrExplain(vault, provider, settings, extraction);
  if (preflight === null) return;

  const built = buildAnalysisRequest(extraction.text, preflight.profile, contactValuesOf(preflight.profile));
  const findings = scanProfileText(built.profileText, contactValuesOf(preflight.profile));
  if (findings.length > 0) {
    logEvent("analyze.blocked", { findings: findings.length });
    setStatus("Blocked: your profile text still contains contact details. Nothing was sent.");
    return;
  }

  const confirmed = await askToSend(provider, settings.models[settings.provider], built.sent);
  if (!confirmed) {
    logEvent("analyze.declined");
    setStatus("Cancelled. Nothing was sent.");
    return;
  }

  setStatus(`Sending to ${provider.label}…`);
  logEvent("analyze.started", { jobChars: built.sent.jobCharacters, skills: built.sent.skills });
  const outcome = await runAnalysis(extraction, preflight.profile, {
    provider,
    model: preflight.model,
    apiKey: preflight.apiKey,
    fetch: (input, init) => fetch(input, init),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  renderOutcome(outcome);
}

function readyOrExplain(
  vault: Vault,
  provider: ProviderAdapter,
  settings: Settings,
  extraction: JobExtraction,
): Preflight | null {
  const data = vault.read();
  if (data.apiKey === null) {
    setStatus(`Add your ${provider.label} API key in Settings first.`);
    return null;
  }
  if (data.profile === null || data.profile.skills.length === 0) {
    setStatus("Save a profile with at least one skill first.");
    return null;
  }
  if (extraction.text.trim() === "") {
    setStatus("The page has no readable job text.");
    return null;
  }
  return {
    provider,
    model: settings.models[settings.provider],
    apiKey: data.apiKey,
    profile: data.profile,
    extraction,
  };
}

// Runs in the active tab's top frame only, and only after the user clicked Analyze.
async function extractFromActiveTab(): Promise<JobExtraction> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) {
    throw new Error("no active tab");
  }
  const target = { tabId: tab.id, allFrames: false };
  await chrome.scripting.executeScript({ target, files: [EXTRACT_FILE] });
  const [injected] = await chrome.scripting.executeScript({
    target,
    func: () =>
      (globalThis as unknown as { JobFitExtract: { extractPage(): unknown } }).JobFitExtract.extractPage(),
  });
  const result = injected?.result as JobExtraction | undefined;
  if (result === undefined || typeof result.text !== "string") {
    throw new Error("no extraction result");
  }
  return result;
}

// Shows exactly what will leave the device and waits for an explicit Send or Cancel.
function askToSend(
  provider: ProviderAdapter,
  model: string,
  sent: { jobCharacters: number; skills: number; roles: number; bullets: number },
): Promise<boolean> {
  const panel = byId("analyze-confirm");
  setText(
    "confirm-summary",
    `Send to ${provider.label} (model ${model}): ${sent.jobCharacters} characters of job posting text, ` +
      `${sent.skills} skills, ${sent.roles} roles, and ${sent.bullets} bullet points from your profile. ` +
      "Contact details are not sent.",
  );
  byId("confirm-free-tier").hidden = provider.id !== "gemini";
  setText(
    "confirm-free-tier",
    "Google's free tier may use these prompts to improve its products. Use a billed key to avoid that.",
  );
  panel.hidden = false;

  return new Promise((resolve) => {
    const send = byId("confirm-send");
    const cancel = byId("confirm-cancel");
    const finish = (answer: boolean) => {
      panel.hidden = true;
      send.removeEventListener("click", onSend);
      cancel.removeEventListener("click", onCancel);
      resolve(answer);
    };
    const onSend = () => finish(true);
    const onCancel = () => finish(false);
    send.addEventListener("click", onSend);
    cancel.addEventListener("click", onCancel);
  });
}

function renderOutcome(outcome: AnalysisOutcome): void {
  const result = byId("analyze-result");
  result.hidden = true;

  switch (outcome.status) {
    case "ok":
      logEvent("analyze.done", { fitScore: outcome.match.fitScore, failures: outcome.gates.failures.length });
      renderResult(outcome);
      setStatus("Done.");
      return;
    case "no-job-text":
      setStatus("The page had no readable job text. Nothing was analysed.");
      return;
    case "blocked":
      logEvent("analyze.blocked", { findings: outcome.findings.length });
      setStatus("Blocked before sending. Nothing was sent.");
      return;
    case "rejected":
      logEvent("analyze.rejected");
      setStatus(
        outcome.reason === "unknown-skill"
          ? "The model named a skill that is not in your profile, so its answer was rejected."
          : "The model's answer did not match the expected format, so it was rejected.",
      );
      return;
    case "provider-error":
      logEvent("analyze.provider_error");
      setStatus(providerMessage(outcome.code));
      return;
  }
}

function providerMessage(code: string): string {
  switch (code) {
    case "RATE_LIMITED":
      return "Rate limited by the provider. Wait a minute and try again.";
    case "KEY_REJECTED":
      return "The provider rejected your API key. Check it in Settings.";
    case "TIMEOUT":
      return "The provider took too long to answer. Try again.";
    case "NETWORK":
      return "Could not reach the provider. Check your connection.";
    default:
      return "The provider returned an error. Nothing was saved.";
  }
}

function renderResult(outcome: Extract<AnalysisOutcome, { status: "ok" }>): void {
  byId("analyze-result").hidden = false;
  setText("result-verdict", VERDICT_LABEL[outcome.verdict]);
  setText("result-job", `${outcome.job.title || "Untitled role"}${outcome.job.location ? ` · ${outcome.job.location}` : ""}`);
  setText("result-score", `Fit score: ${outcome.match.fitScore} / 100`);
  fillList("result-matched", outcome.match.matchedSkills);
  fillList("result-gaps", outcome.match.gaps);
  fillList("result-gates", [...outcome.gates.failures.map((f) => `Stop: ${f}`), ...outcome.gates.warnings]);
  setText("result-reason", outcome.match.reason);
  setText("result-summary", outcome.job.summary);
}

function fillList(id: string, items: readonly string[]): void {
  const list = byId(id);
  list.replaceChildren();
  for (const text of items) {
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
  }
  if (items.length === 0) {
    const item = document.createElement("li");
    item.textContent = "None";
    list.append(item);
  }
}

function setStatus(text: string): void {
  setText("analyze-status", text);
}
