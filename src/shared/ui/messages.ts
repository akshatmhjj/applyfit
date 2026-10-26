import { MIN_PASSPHRASE_LENGTH, VaultError } from "../vault/vault";

// User-facing text for vault errors. Never includes the passphrase, the key, or data.
export function vaultErrorMessage(error: unknown): string {
  if (error instanceof VaultError) {
    switch (error.code) {
      case "DECRYPT_FAILED":
        return "Wrong passphrase, or the vault was changed in another window.";
      case "NO_VAULT":
        return "No vault yet. Create one in settings.";
      case "ALREADY_EXISTS":
        return "A vault already exists.";
      case "WEAK_PASSPHRASE":
        return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
      case "LOCKED":
        return "Unlock first.";
      case "CORRUPT":
        return "Stored data is damaged. Nothing was changed.";
    }
  }
  return "Something went wrong.";
}
