import { AutoLock } from "../shared/autoLock";
import { logEvent } from "../shared/log";
import { loadSettings, SettingsSchema, saveSettings, type ProviderId, type Settings } from "../shared/settings";
import { ChromeLocalStore } from "../shared/storage/store";
import { byId, setText, showOnly, watchActivity } from "../shared/ui/dom";
import { vaultErrorMessage } from "../shared/ui/messages";
import { Vault } from "../shared/vault/vault";
import { EMPTY_VAULT_DATA } from "../shared/vault/vaultData";

const MINUTE_MS = 60_000;
const VAULT_VIEWS = ["vault-setup", "vault-unlock", "vault-unlocked"];
const store = new ChromeLocalStore();
const vault = new Vault(store);
let autoLock: AutoLock | null = null;
// The settings currently shown. Kept so that switching provider keeps each provider's model.
let shown: Settings | null = null;

function startAutoLock(minutes: number): void {
  autoLock?.stop();
  autoLock = new AutoLock(minutes * MINUTE_MS, () => {
    logEvent("vault.auto_locked");
    void refresh("Locked after inactivity.");
  });
  autoLock.touch();
}

function stopAutoLock(): void {
  autoLock?.stop();
  autoLock = null;
}

// Redraws the vault and API-key sections from the vault's current state.
async function refresh(vaultMessage = ""): Promise<void> {
  if (!(await vault.exists())) {
    showOnly(VAULT_VIEWS, "vault-setup");
  } else if (!vault.isUnlocked) {
    showOnly(VAULT_VIEWS, "vault-unlock");
  } else {
    showOnly(VAULT_VIEWS, "vault-unlocked");
    const minutes = (await loadSettings(store)).autoLockMinutes;
    setText("unlock-state", `Unlocked. Locks after ${minutes} minutes of inactivity.`);
  }
  setText("vault-message", vaultMessage);

  const unlocked = vault.isUnlocked;
  byId<HTMLFieldSetElement>("apikey-fields").disabled = !unlocked;
  setText(
    "apikey-status",
    unlocked
      ? vault.read().apiKey === null
        ? "No key saved."
        : "A key is saved. It is not shown here."
      : "Unlock the vault above to change the key.",
  );
}

byId<HTMLFormElement>("setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const passphrase = byId<HTMLInputElement>("setup-passphrase").value;
  const confirm = byId<HTMLInputElement>("setup-confirm").value;
  if (passphrase !== confirm) {
    setText("vault-message", "Passphrases do not match.");
    return;
  }
  try {
    await vault.create(passphrase, EMPTY_VAULT_DATA);
    logEvent("vault.created");
    byId<HTMLInputElement>("setup-passphrase").value = "";
    byId<HTMLInputElement>("setup-confirm").value = "";
    startAutoLock((await loadSettings(store)).autoLockMinutes);
    await refresh("Vault created.");
  } catch (error) {
    setText("vault-message", vaultErrorMessage(error));
  }
});

byId<HTMLFormElement>("unlock-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = byId<HTMLInputElement>("unlock-passphrase");
  const passphrase = input.value;
  input.value = "";
  try {
    await vault.unlock(passphrase);
    logEvent("vault.unlocked");
    startAutoLock((await loadSettings(store)).autoLockMinutes);
    await refresh("");
  } catch (error) {
    logEvent("vault.unlock_failed");
    setText("vault-message", vaultErrorMessage(error));
  }
});

byId("lock-now").addEventListener("click", async () => {
  vault.lock();
  stopAutoLock();
  logEvent("vault.locked");
  await refresh("Locked.");
});

byId<HTMLFormElement>("passphrase-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const next = byId<HTMLInputElement>("new-passphrase").value;
  const confirm = byId<HTMLInputElement>("new-passphrase-confirm").value;
  if (next !== confirm) {
    setText("vault-message", "Passphrases do not match.");
    return;
  }
  try {
    await vault.changePassphrase(next);
    logEvent("vault.passphrase_changed");
    byId<HTMLFormElement>("passphrase-form").reset();
    // Other open pages still hold the old key. Their next save fails and they lock.
    await refresh("Passphrase changed. Other open windows will ask you to unlock again.");
  } catch (error) {
    setText("vault-message", vaultErrorMessage(error));
  }
});

// Switching provider shows that provider's own model name. Each one keeps its own.
function showProvider(provider: ProviderId): void {
  if (shown === null) return;
  byId<HTMLInputElement>("model").value = shown.models[provider];
  byId("gemini-warning").hidden = provider !== "gemini";
}

byId<HTMLSelectElement>("provider").addEventListener("change", (event) => {
  if (shown === null) return;
  const from = shown.provider;
  shown.models[from] = byId<HTMLInputElement>("model").value.trim();
  shown.provider = (event.target as HTMLSelectElement).value as ProviderId;
  showProvider(shown.provider);
});

byId<HTMLFormElement>("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (shown === null) return;
  const provider = byId<HTMLSelectElement>("provider").value as ProviderId;
  const models = { ...shown.models, [provider]: byId<HTMLInputElement>("model").value.trim() };
  const parsed = SettingsSchema.safeParse({
    provider,
    models,
    autoLockMinutes: Number(byId<HTMLInputElement>("auto-lock-minutes").value),
    modelAssistedAutofill: byId<HTMLInputElement>("model-assisted").checked,
  });
  if (!parsed.success) {
    setText("settings-message", "Check the values: model names must be plain names, and the timeout must be 1 to 240 minutes.");
    return;
  }
  await saveSettings(store, parsed.data);
  shown = parsed.data;
  logEvent("settings.saved");
  setText("settings-message", "Saved.");
  if (vault.isUnlocked) {
    startAutoLock(parsed.data.autoLockMinutes);
    await refresh();
  }
});

byId<HTMLFormElement>("apikey-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = byId<HTMLInputElement>("api-key");
  const key = input.value.trim();
  input.value = "";
  if (key === "") {
    setText("apikey-message", "Enter a key first.");
    return;
  }
  try {
    await vault.update((data) => ({ ...data, apiKey: key }));
    logEvent("apikey.saved");
    setText("apikey-message", "Key saved.");
    await refresh();
  } catch (error) {
    setText("apikey-message", vaultErrorMessage(error));
  }
});

byId("remove-key").addEventListener("click", async () => {
  try {
    await vault.update((data) => ({ ...data, apiKey: null }));
    logEvent("apikey.removed");
    setText("apikey-message", "Key removed.");
    await refresh();
  } catch (error) {
    setText("apikey-message", vaultErrorMessage(error));
  }
});

async function loadSettingsForm(): Promise<void> {
  shown = await loadSettings(store);
  byId<HTMLSelectElement>("provider").value = shown.provider;
  showProvider(shown.provider);
  byId<HTMLInputElement>("auto-lock-minutes").value = String(shown.autoLockMinutes);
  byId<HTMLInputElement>("model-assisted").checked = shown.modelAssistedAutofill;
}

watchActivity(() => autoLock?.touch());
window.addEventListener("pagehide", () => vault.lock());

void loadSettingsForm();
void refresh();
