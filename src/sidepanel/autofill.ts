import { classify, type FieldKey } from "../autofill/rules";
import type { FieldDescriptor } from "../autofill/fields";
import { buildPlan, type PlanRow } from "../autofill/plan";
import { mapUnclearFields } from "../autofill/modelMap";
import type { FillPayload, FillResult } from "../autofill/fill";
import { contactValuesOf } from "../analysis/prompt";
import { logEvent } from "../shared/log";
import { getProvider } from "../shared/providers/registry";
import { ensureProviderHost } from "../shared/providers/permission";
import type { Profile } from "../shared/schemas/profile";
import type { Settings } from "../shared/settings";
import { byId, setText } from "../shared/ui/dom";
import type { Vault } from "../shared/vault/vault";

const SCAN_FILE = "content/scanFields.js";
const FILL_FILE = "content/fillFields.js";
const REQUEST_TIMEOUT_MS = 45_000;

interface ScanResult {
  fingerprint: string;
  fields: FieldDescriptor[];
}

interface Pending {
  tabId: number;
  fingerprint: string;
  rows: PlanRow[];
  checkboxes: Map<number, HTMLInputElement>;
}

let pending: Pending | null = null;

// Click handler. When model-assisted mapping is on, the permission request is the first
// await, so it stays inside the click.
export async function onAutofillScan(vault: Vault, settings: Settings): Promise<void> {
  const provider = getProvider(settings.provider);
  if (settings.modelAssistedAutofill) {
    if (!(await ensureProviderHost(provider))) {
      setStatus(`Permission to contact ${provider.label} was not granted. Model-assisted mapping is off for this scan.`);
    }
  }

  const data = vault.read();
  if (data.profile === null) {
    setStatus("Save your profile first.");
    return;
  }

  setStatus("Scanning the form on the active tab…");
  let scan: ScanResult;
  let tabId: number;
  try {
    ({ scan, tabId } = await scanActiveTab());
  } catch {
    setStatus("Could not read the form on this page. Open the application page in the active tab and try again.");
    return;
  }
  logEvent("autofill.scanned", { fields: scan.fields.length });

  const modelKeys = await modelKeysFor(scan.fields, settings, data.apiKey, data.profile);
  const rows = buildPlan(scan.fields, data.profile, modelKeys);
  renderPreview(tabId, scan.fingerprint, rows);
}

async function modelKeysFor(
  fields: FieldDescriptor[],
  settings: Settings,
  apiKey: string | null,
  profile: Profile,
): Promise<Map<number, Exclude<FieldKey, "resume">>> {
  const unclear = fields.filter((field) => classify(field).kind === "unclear");
  if (!settings.modelAssistedAutofill || unclear.length === 0 || apiKey === null) {
    return new Map();
  }
  const provider = getProvider(settings.provider);
  const outcome = await mapUnclearFields(unclear, {
    provider,
    model: settings.models[settings.provider],
    apiKey,
    fetch: (input, init) => fetch(input, init),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    contactValues: contactValuesOf(profile),
  });
  if (outcome.status === "ok") {
    logEvent("autofill.model_mapped", { fields: outcome.keys.size });
    return outcome.keys;
  }
  setStatus(
    outcome.status === "blocked"
      ? "Model-assisted mapping was skipped because a label contained your contact details."
      : "Model-assisted mapping did not return a usable answer. Rules-only results are shown.",
  );
  return new Map();
}

async function scanActiveTab(): Promise<{ scan: ScanResult; tabId: number }> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) throw new Error("no active tab");
  const target = { tabId: tab.id, allFrames: false };
  await chrome.scripting.executeScript({ target, files: [SCAN_FILE] });
  const [injected] = await chrome.scripting.executeScript({
    target,
    func: () =>
      (globalThis as unknown as { JobFitScan: { scanForm(): unknown } }).JobFitScan.scanForm(),
  });
  const result = injected?.result as ScanResult | undefined;
  if (result === undefined || !Array.isArray(result.fields) || typeof result.fingerprint !== "string") {
    throw new Error("no scan result");
  }
  return { scan: result, tabId: tab.id };
}

function renderPreview(tabId: number, fingerprint: string, rows: PlanRow[]): void {
  const list = byId("autofill-rows");
  list.replaceChildren();
  const checkboxes = new Map<number, HTMLInputElement>();

  for (const row of rows) {
    const item = document.createElement("li");
    if (row.status === "fill") {
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !row.replacesText;
      checkboxes.set(row.index, box);
      const label = document.createElement("label");
      label.className = "check";
      label.append(box, document.createTextNode(" "));
      const text = document.createElement("span");
      text.textContent = `${row.title}: ${row.key === "resume" ? "resume PDF" : row.value ?? ""}`;
      label.append(text);
      item.append(label);
      if (row.replacesText) {
        const note = document.createElement("span");
        note.className = "muted";
        note.textContent = " (replaces text already in the field)";
        item.append(note);
      }
    } else {
      const text = document.createElement("span");
      text.className = "muted";
      text.textContent = `${row.title}: ${row.reason}`;
      item.append(text);
    }
    list.append(item);
  }

  pending = { tabId, fingerprint, rows, checkboxes };
  setText(
    "autofill-resume-note",
    rows.some((row) => row.key === "resume")
      ? "This form has a resume upload. Your default resume will be attached if you keep its row checked."
      : "",
  );
  byId("autofill-preview").hidden = false;
  const fills = rows.filter((row) => row.status === "fill").length;
  setStatus(`Found ${rows.length} fields. ${fills} can be filled. Check the ones you want, then fill.`);
  setText("autofill-result", "");
}

// Called by the Fill button. Writes only the checked fields and never submits.
// The resume is the default one stored in the vault.
export async function onAutofillFill(vault: Vault): Promise<void> {
  if (pending === null) {
    setStatus("Scan the form first.");
    return;
  }
  const current = pending;
  const selected = current.rows.filter(
    (row) => row.status === "fill" && current.checkboxes.get(row.index)?.checked === true,
  );
  const fills = selected
    .filter((row) => row.key !== "resume" && row.value !== undefined)
    .map((row) => ({ index: row.index, value: row.value ?? "" }));

  const resumeRow = selected.find((row) => row.key === "resume");
  let resume: FillPayload["resume"];
  if (resumeRow !== undefined) {
    const stored = vault.read().resume;
    if (stored === null) {
      setStatus("No default resume yet. Save one in Your details, or uncheck the resume row.");
      return;
    }
    resume = {
      index: resumeRow.index,
      name: stored.name,
      mimeType: stored.mimeType,
      base64: stored.base64,
    };
  }

  if (fills.length === 0 && resume === undefined) {
    setStatus("Nothing is checked.");
    return;
  }

  const payload: FillPayload = { fingerprint: current.fingerprint, fills, ...(resume ? { resume } : {}) };
  setStatus("Filling the checked fields…");
  try {
    const target = { tabId: current.tabId, allFrames: false };
    await chrome.scripting.executeScript({ target, files: [FILL_FILE] });
    const [injected] = await chrome.scripting.executeScript({
      target,
      args: [payload],
      func: (value: FillPayload) =>
        (globalThis as unknown as { JobFitFill: { fillForm(p: FillPayload): unknown } }).JobFitFill.fillForm(value),
    });
    reportResult(injected?.result as FillResult | undefined, fills.length);
  } catch {
    setStatus("Could not fill this page. Nothing was submitted.");
  }
  pending = null;
  byId("autofill-preview").hidden = true;
}

function reportResult(result: FillResult | undefined, attempted: number): void {
  if (result === undefined) {
    setStatus("No result from the page. Nothing was submitted.");
    return;
  }
  switch (result.status) {
    case "changed-page":
      logEvent("autofill.changed_page");
      setStatus("The page changed after the preview, so nothing was filled. Scan the form again.");
      return;
    case "resume-unsupported":
      setStatus("This browser cannot attach files here, so nothing was filled.");
      return;
    case "done":
      logEvent("autofill.filled", { filled: result.filled, skipped: result.skipped });
      setStatus(
        `Filled ${result.filled} of ${attempted} checked fields${result.resume ? " and attached the resume" : ""}. ` +
          "Nothing was submitted. Review the form, then use the page's own submit button.",
      );
      return;
  }
}

export function onAutofillCancel(): void {
  pending = null;
  byId("autofill-preview").hidden = true;
  setStatus("Cancelled. Nothing was filled.");
}

function setStatus(text: string): void {
  setText("autofill-status", text);
}
