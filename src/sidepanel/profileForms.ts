import { logEvent } from "../shared/log";
import { BLANK_PROFILE, ProfileSchema, type Profile } from "../shared/schemas/profile";
import { byId, setText } from "../shared/ui/dom";
import { vaultErrorMessage } from "../shared/ui/messages";
import { toBase64 } from "../shared/vault/crypto";
import { checkResumeBytes, type StoredResume, type VaultData } from "../shared/vault/vaultData";
import type { Vault } from "../shared/vault/vault";

// Contact details and the default resume. Both are saved once, encrypted in the vault, and
// are there every time the vault is unlocked.

// Each contact field: the form input id, and the profile key it fills.
const CONTACT_FIELDS = [
  ["c-name", "name"],
  ["c-email", "email"],
  ["c-phone", "phone"],
  ["c-address", "addressLine1"],
  ["c-city", "city"],
  ["c-region", "region"],
  ["c-postal", "postalCode"],
  ["c-country", "country"],
  ["c-linkedin", "linkedin"],
  ["c-github", "github"],
  ["c-portfolio", "portfolio"],
] as const;

type ContactKey = (typeof CONTACT_FIELDS)[number][1];

export function showContact(profile: Profile | null): void {
  const contact = (profile ?? BLANK_PROFILE).contact;
  for (const [inputId, key] of CONTACT_FIELDS) {
    byId<HTMLInputElement>(inputId).value = contact[key as ContactKey] ?? "";
  }
}

export function showResume(resume: StoredResume | null): void {
  setText(
    "resume-current",
    resume === null
      ? "No default resume yet. Upload one below. It is stored encrypted and used for autofill."
      : `Default resume: ${resume.name}, saved ${new Date(resume.uploadedAt).toLocaleDateString()}.`,
  );
  byId<HTMLButtonElement>("resume-remove").disabled = resume === null;
}

// Saves the contact form. The profile is validated as a whole, so a bad value cannot break it.
export async function onContactSubmit(vault: Vault): Promise<void> {
  const current = vault.read().profile ?? BLANK_PROFILE;
  const contact: Record<string, string> = {};
  for (const [inputId, key] of CONTACT_FIELDS) {
    const value = byId<HTMLInputElement>(inputId).value.trim();
    if (value !== "") contact[key] = value;
  }

  const parsed = ProfileSchema.safeParse({ ...current, contact });
  if (!parsed.success) {
    setText("contact-message", "Check the contact details: an email, a URL, or a value is not valid.");
    return;
  }
  try {
    await vault.update((data) => ({ ...data, profile: parsed.data }));
    logEvent("profile.saved", { skills: parsed.data.skills.length });
    setText("contact-message", "Saved.");
  } catch (error) {
    setText("contact-message", vaultErrorMessage(error));
  }
}

export async function onResumeSave(vault: Vault): Promise<void> {
  const input = byId<HTMLInputElement>("resume-upload");
  const file = input.files?.[0];
  if (file === undefined) {
    setText("resume-message", "Choose a PDF first.");
    return;
  }
  // Check the size before reading the file into memory.
  if (file.size > 2 * 1024 * 1024) {
    setText("resume-message", "The file is larger than 2 MB. Choose a smaller PDF.");
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const problem = checkResumeBytes(bytes);
  if (problem !== null) {
    setText("resume-message", problem);
    return;
  }

  const resume: StoredResume = {
    name: file.name.slice(0, 200),
    mimeType: "application/pdf",
    base64: toBase64(bytes),
    uploadedAt: new Date().toISOString(),
  };
  try {
    await vault.update((data: VaultData) => ({ ...data, resume }));
    input.value = "";
    logEvent("resume.saved");
    showResume(resume);
    setText("resume-message", "Saved as your default resume.");
  } catch (error) {
    setText("resume-message", vaultErrorMessage(error));
  }
}

export async function onResumeRemove(vault: Vault): Promise<void> {
  if (!window.confirm("Remove your default resume from this device? You can upload it again later.")) {
    return;
  }
  try {
    await vault.update((data) => ({ ...data, resume: null }));
    logEvent("resume.removed");
    showResume(null);
    setText("resume-message", "Removed.");
  } catch (error) {
    setText("resume-message", vaultErrorMessage(error));
  }
}
