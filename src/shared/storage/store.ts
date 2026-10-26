// Minimal key-value interface. The extension uses chrome.storage.local;
// tests use an in-memory map. Values are validated by the caller, not here.
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export class ChromeLocalStore implements KeyValueStore {
  async get(key: string): Promise<unknown> {
    const result = await chrome.storage.local.get(key);
    return result[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }
}
