import { AutoLock } from "../shared/autoLock";
import { loadSettings } from "../shared/settings";
import { logEvent } from "../shared/log";
import { BLANK_PROFILE, parseProfileJson } from "../shared/schemas/profile";
import { ChromeLocalStore } from "../shared/storage/store";
import { byId, setText, showOnly, watchActivity } from "../shared/ui/dom";
import { vaultErrorMessage } from "../shared/ui/messages";
import { Vault, VaultError } from "../shared/vault/vault";

const VIEWS = ["view-no-vault", "view-unlock", "view-profile"];
const MINUTE_MS = 60_000;

const vault = new Vault(new ChromeLocalStore());
let autoLock: AutoLock | null = null;

function lockNow(message: string): void {
  autoLock?.stop();
  autoLock = null;
  vault.lock();
  setText("lock-state", "Locked");
  setText("unlock-message", message);
  showOnly(VIEWS, "view-unlock");
}

function startAutoLock(minutes: number): void {
  autoLock?.stop();
  autoLock = new AutoLock(minutes * MINUTE_MS, () => {
    logEvent("vault.auto_locked");
    lockNow("Locked after inactivity.");
  });
  autoLock.touch();
}

function openProfile(): void {
  const data = vault.read();
  byId<HTMLTextAreaElement>("profile-json").value = JSON.stringify(
    data.profile ?? BLANK_PROFILE,
    null,
    2,
  );
  setText("lock-state", "Unlocked");
  setText("profile-message", "");
  showOnly(VIEWS, "view-profile");
}

async function start(): Promise<void> {
  if (await vault.exists()) {
    showOnly(VIEWS, "view-unlock");
  } else {
    showOnly(VIEWS, "view-no-vault");
  }
}

byId("open-options").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});

byId<HTMLFormElement>("unlock-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = byId<HTMLInputElement>("unlock-passphrase");
  const passphrase = input.value;
  input.value = "";
  try {
    await vault.unlock(passphrase);
    logEvent("vault.unlocked");
    startAutoLock((await loadSettings(new ChromeLocalStore())).autoLockMinutes);
    setText("unlock-message", "");
    openProfile();
  } catch (error) {
    logEvent("vault.unlock_failed");
    setText("unlock-message", vaultErrorMessage(error));
  }
});

byId("lock-now").addEventListener("click", () => {
  logEvent("vault.locked");
  lockNow("Locked.");
});

byId("save-profile").addEventListener("click", async () => {
  const text = byId<HTMLTextAreaElement>("profile-json").value;
  const errorList = byId("profile-errors");
  errorList.replaceChildren();

  const result = parseProfileJson(text);
  if (!result.ok) {
    logEvent("profile.invalid", { errors: result.errors.length });
    for (const message of result.errors) {
      const item = document.createElement("li");
      item.textContent = message;
      errorList.append(item);
    }
    setText("profile-message", "Not saved. Fix the errors above.");
    return;
  }

  const profile = result.profile;
  try {
    await vault.update((data) => ({ ...data, profile }));
    const bullets =
      profile.experience.reduce((n, e) => n + e.bullets.length, 0) +
      profile.projects.reduce((n, p) => n + p.bullets.length, 0);
    logEvent("profile.saved", { skills: profile.skills.length, bullets });
    setText("profile-message", "Saved.");
  } catch (error) {
    if (error instanceof VaultError && (error.code === "DECRYPT_FAILED" || error.code === "LOCKED")) {
      lockNow("The vault changed in another window. Unlock again.");
      return;
    }
    setText("profile-message", vaultErrorMessage(error));
  }
});

watchActivity(() => autoLock?.touch());
window.addEventListener("pagehide", () => vault.lock());

void start();
