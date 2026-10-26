import { describe, expect, it } from "vitest";
import { MemoryStore } from "../helpers/memoryStore";
import { deriveKey, KDF_ITERATIONS, newKdfParams } from "../../src/shared/vault/crypto";
import { Vault, VaultError } from "../../src/shared/vault/vault";
import { EMPTY_VAULT_DATA, type VaultData } from "../../src/shared/vault/vaultData";

const PASSPHRASE = "correct horse battery staple";
const SECRET_KEY = "sk-test-SECRET-VALUE-do-not-store-plaintext";

const sampleData: VaultData = {
  profile: null,
  apiKey: SECRET_KEY,
  resume: null,
};

async function createdVault(store = new MemoryStore()): Promise<{ store: MemoryStore; vault: Vault }> {
  const vault = new Vault(store);
  await vault.create(PASSPHRASE, sampleData);
  vault.lock();
  return { store, vault };
}

async function expectVaultError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
  await expect(promise).rejects.toBeInstanceOf(VaultError);
}

describe("vault round trip", () => {
  it("decrypts exactly what was written, after lock and unlock", async () => {
    const { store } = await createdVault();
    const vault = new Vault(store);
    await vault.unlock(PASSPHRASE);
    expect(vault.read()).toEqual(sampleData);
  });

  it("never stores the API key or profile in plaintext", async () => {
    const { store } = await createdVault();
    expect(store.dump()).not.toContain(SECRET_KEY);
    expect(store.dump()).not.toContain("apiKey");
  });

  it("writes new data and reads it back after unlock", async () => {
    const { store, vault } = await createdVault();
    await vault.unlock(PASSPHRASE);
    await vault.write({ ...EMPTY_VAULT_DATA, apiKey: "sk-other-key-value-123" });
    vault.lock();

    const reopened = new Vault(store);
    await reopened.unlock(PASSPHRASE);
    expect(reopened.read().apiKey).toBe("sk-other-key-value-123");
  });

  it("uses a fresh IV on every write", async () => {
    const { store, vault } = await createdVault();
    await vault.unlock(PASSPHRASE);
    const first = (await store.get("vault")) as { iv: string };
    await vault.write(sampleData);
    const second = (await store.get("vault")) as { iv: string };
    expect(second.iv).not.toBe(first.iv);
  });
});

describe("vault failure modes", () => {
  it("rejects the wrong passphrase with DECRYPT_FAILED", async () => {
    const { store } = await createdVault();
    const vault = new Vault(store);
    await expectVaultError(vault.unlock("the wrong passphrase here"), "DECRYPT_FAILED");
    expect(vault.isUnlocked).toBe(false);
  });

  it("rejects a tampered ciphertext", async () => {
    const { store } = await createdVault();
    await store.tamper("vault", (blob) => {
      const data = blob.data as string;
      // Flip the first character to a different base64 character.
      blob.data = (data[0] === "A" ? "B" : "A") + data.slice(1);
    });
    await expectVaultError(new Vault(store).unlock(PASSPHRASE), "DECRYPT_FAILED");
  });

  it("rejects a tampered salt, because KDF parameters are authenticated", async () => {
    const { store } = await createdVault();
    const fresh = newKdfParams();
    await store.tamper("vault", (blob) => {
      blob.kdf = { ...(blob.kdf as object), salt: fresh.salt };
    });
    await expectVaultError(new Vault(store).unlock(PASSPHRASE), "DECRYPT_FAILED");
  });

  it("refuses a stored iteration count below the minimum (downgrade attack)", async () => {
    const { store } = await createdVault();
    await store.tamper("vault", (blob) => {
      blob.kdf = { ...(blob.kdf as object), iterations: 1000 };
    });
    await expectVaultError(new Vault(store).unlock(PASSPHRASE), "CORRUPT");
  });

  it("reports NO_VAULT when nothing is stored", async () => {
    await expectVaultError(new Vault(new MemoryStore()).unlock(PASSPHRASE), "NO_VAULT");
  });

  it("reports CORRUPT for a stored value of the wrong shape", async () => {
    const store = new MemoryStore();
    await store.set("vault", { version: 99 });
    await expectVaultError(new Vault(store).unlock(PASSPHRASE), "CORRUPT");
  });

  it("refuses to create a second vault over an existing one", async () => {
    const { store } = await createdVault();
    await expectVaultError(new Vault(store).create(PASSPHRASE, EMPTY_VAULT_DATA), "ALREADY_EXISTS");
  });

  it("rejects short passphrases when creating or changing one", async () => {
    const vault = new Vault(new MemoryStore());
    await expectVaultError(vault.create("short", EMPTY_VAULT_DATA), "WEAK_PASSPHRASE");

    await vault.create(PASSPHRASE, EMPTY_VAULT_DATA);
    await expectVaultError(vault.changePassphrase("short"), "WEAK_PASSPHRASE");
  });
});

describe("vault lock behavior", () => {
  it("refuses to read or write while locked", async () => {
    const { vault } = await createdVault();
    expect(() => vault.read()).toThrow(VaultError);
    await expectVaultError(vault.write(sampleData), "LOCKED");
  });

  it("drops all decrypted state on lock", async () => {
    const { store } = await createdVault();
    const vault = new Vault(store);
    await vault.unlock(PASSPHRASE);
    expect(vault.isUnlocked).toBe(true);
    vault.lock();
    expect(vault.isUnlocked).toBe(false);
    expect(() => vault.read()).toThrow(VaultError);
  });

  it("returns a copy, so mutating the result does not change the unlocked state", async () => {
    const { store } = await createdVault();
    const vault = new Vault(store);
    await vault.unlock(PASSPHRASE);
    const copy = vault.read();
    copy.apiKey = "changed";
    expect(vault.read().apiKey).toBe(SECRET_KEY);
  });
});

describe("passphrase change", () => {
  it("makes the old passphrase fail and the new one work", async () => {
    const { store } = await createdVault();
    const vault = new Vault(store);
    await vault.unlock(PASSPHRASE);
    await vault.changePassphrase("a brand new passphrase");
    vault.lock();

    await expectVaultError(new Vault(store).unlock(PASSPHRASE), "DECRYPT_FAILED");
    const reopened = new Vault(store);
    await reopened.unlock("a brand new passphrase");
    expect(reopened.read().apiKey).toBe(SECRET_KEY);
  });
});

describe("two open pages sharing one vault", () => {
  it("update() keeps a change made by the other page instead of overwriting it", async () => {
    const { store } = await createdVault();
    const panel = new Vault(store);
    const options = new Vault(store);
    await panel.unlock(PASSPHRASE);
    await options.unlock(PASSPHRASE);

    await options.update((data) => ({ ...data, apiKey: "sk-new-key-saved-by-options" }));
    await panel.update((data) => ({ ...data, profile: null }));

    panel.lock();
    const reopened = new Vault(store);
    await reopened.unlock(PASSPHRASE);
    expect(reopened.read().apiKey).toBe("sk-new-key-saved-by-options");
  });

  it("update() fails with DECRYPT_FAILED after the other page changed the passphrase", async () => {
    const { store } = await createdVault();
    const panel = new Vault(store);
    const options = new Vault(store);
    await panel.unlock(PASSPHRASE);
    await options.unlock(PASSPHRASE);

    await options.changePassphrase("a different passphrase entirely");

    await expectVaultError(
      panel.update((data) => data),
      "DECRYPT_FAILED",
    );
  });
});

describe("key derivation", () => {
  it("derives a non-extractable key, so its bytes cannot be read by page code", async () => {
    const key = await deriveKey(PASSPHRASE, newKdfParams());
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("uses PBKDF2 at the documented iteration count by default", () => {
    expect(newKdfParams()).toMatchObject({
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: KDF_ITERATIONS,
    });
    expect(KDF_ITERATIONS).toBe(600_000);
  });
});
