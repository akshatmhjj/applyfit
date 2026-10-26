import type { KeyValueStore } from "../../src/shared/storage/store";

// Stores values as JSON text, the same way chrome.storage does, so tests catch
// anything that would not survive serialization.
export class MemoryStore implements KeyValueStore {
  readonly #data = new Map<string, string>();

  async get(key: string): Promise<unknown> {
    const raw = this.#data.get(key);
    return raw === undefined ? undefined : JSON.parse(raw);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.#data.set(key, JSON.stringify(value));
  }

  // Raw stored text for every key, used to check that secrets are never stored in plaintext.
  dump(): string {
    return JSON.stringify(Object.fromEntries(this.#data));
  }

  async tamper(key: string, mutate: (value: Record<string, unknown>) => void): Promise<void> {
    const value = (await this.get(key)) as Record<string, unknown>;
    mutate(value);
    await this.set(key, value);
  }
}
