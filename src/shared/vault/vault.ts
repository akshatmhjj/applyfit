import type { KeyValueStore } from "../storage/store";
import {
  CryptoError,
  deriveKey,
  newKdfParams,
  open,
  seal,
  VaultBlobSchema,
  type KdfParams,
} from "./crypto";
import { VaultDataSchema, type VaultData } from "./vaultData";

const VAULT_KEY = "vault";
export const MIN_PASSPHRASE_LENGTH = 12;

export type VaultErrorCode =
  | "NO_VAULT"
  | "ALREADY_EXISTS"
  | "LOCKED"
  | "WEAK_PASSPHRASE"
  | "DECRYPT_FAILED"
  | "CORRUPT";

export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode) {
    super(code);
    this.name = "VaultError";
  }
}

// Holds the derived key and the decrypted data only while unlocked, and only in memory.
// Nothing here is written to storage in plaintext.
export class Vault {
  readonly #store: KeyValueStore;
  #key: CryptoKey | null = null;
  #kdf: KdfParams | null = null;
  #data: VaultData | null = null;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  async exists(): Promise<boolean> {
    return (await this.#store.get(VAULT_KEY)) !== undefined;
  }

  get isUnlocked(): boolean {
    return this.#key !== null;
  }

  async create(passphrase: string, initial: VaultData): Promise<void> {
    if (await this.exists()) {
      throw new VaultError("ALREADY_EXISTS");
    }
    await this.#sealWithNewKey(passphrase, VaultDataSchema.parse(initial));
  }

  async unlock(passphrase: string): Promise<void> {
    const raw = await this.#store.get(VAULT_KEY);
    if (raw === undefined) {
      throw new VaultError("NO_VAULT");
    }
    const parsed = VaultBlobSchema.safeParse(raw);
    if (!parsed.success) {
      throw new VaultError("CORRUPT");
    }
    const blob = parsed.data;
    const key = await deriveKey(passphrase, blob.kdf);
    let data: VaultData;
    try {
      const json = await open(key, blob);
      data = VaultDataSchema.parse(JSON.parse(json));
    } catch (error) {
      if (error instanceof CryptoError) {
        throw new VaultError("DECRYPT_FAILED");
      }
      throw new VaultError("CORRUPT");
    }
    this.#key = key;
    this.#kdf = blob.kdf;
    this.#data = data;
  }

  lock(): void {
    this.#key = null;
    this.#kdf = null;
    this.#data = null;
  }

  // Returns a copy so callers cannot change the unlocked state by accident.
  read(): VaultData {
    if (this.#data === null) {
      throw new VaultError("LOCKED");
    }
    return structuredClone(this.#data);
  }

  async write(data: VaultData): Promise<void> {
    if (this.#key === null || this.#kdf === null) {
      throw new VaultError("LOCKED");
    }
    const valid = VaultDataSchema.parse(data);
    const blob = await seal(this.#key, this.#kdf, JSON.stringify(valid));
    await this.#store.set(VAULT_KEY, blob);
    this.#data = structuredClone(valid);
  }

  // Read-modify-write against the stored vault, not the copy in memory. The side
  // panel and the options page each hold their own unlocked copy, so writing a
  // stale copy would silently undo the other page's change.
  async update(mutate: (current: VaultData) => VaultData): Promise<void> {
    const current = await this.#reload();
    await this.write(mutate(current));
  }

  // A new salt and key are used, so the old passphrase stops working immediately.
  async changePassphrase(newPassphrase: string): Promise<void> {
    const current = await this.#reload();
    await this.#sealWithNewKey(newPassphrase, current);
  }

  // Decrypts the stored blob with the held key. If another page changed the
  // passphrase (new salt), the held key no longer matches and this fails.
  async #reload(): Promise<VaultData> {
    if (this.#key === null || this.#kdf === null) {
      throw new VaultError("LOCKED");
    }
    const raw = await this.#store.get(VAULT_KEY);
    const parsed = VaultBlobSchema.safeParse(raw);
    if (!parsed.success) {
      throw new VaultError("CORRUPT");
    }
    if (parsed.data.kdf.salt !== this.#kdf.salt) {
      throw new VaultError("DECRYPT_FAILED");
    }
    try {
      const json = await open(this.#key, parsed.data);
      return VaultDataSchema.parse(JSON.parse(json));
    } catch (error) {
      throw new VaultError(error instanceof CryptoError ? "DECRYPT_FAILED" : "CORRUPT");
    }
  }

  async #sealWithNewKey(passphrase: string, data: VaultData): Promise<void> {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      throw new VaultError("WEAK_PASSPHRASE");
    }
    const kdf = newKdfParams();
    const key = await deriveKey(passphrase, kdf);
    const blob = await seal(key, kdf, JSON.stringify(data));
    await this.#store.set(VAULT_KEY, blob);
    this.#key = key;
    this.#kdf = kdf;
    this.#data = structuredClone(data);
  }
}
