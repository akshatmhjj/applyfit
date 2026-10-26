import { describe, expect, it } from "vitest";
import { MemoryStore } from "../helpers/memoryStore";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "../../src/shared/settings";

describe("settings", () => {
  it("returns defaults when nothing is stored", async () => {
    expect(await loadSettings(new MemoryStore())).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps model-assisted autofill off by default (privacy)", () => {
    expect(DEFAULT_SETTINGS.modelAssistedAutofill).toBe(false);
  });

  it("auto-locks after 15 minutes by default", () => {
    expect(DEFAULT_SETTINGS.autoLockMinutes).toBe(15);
  });

  it("round-trips saved settings", async () => {
    const store = new MemoryStore();
    const next = { ...DEFAULT_SETTINGS, autoLockMinutes: 5, model: "claude-haiku-5-5" };
    await saveSettings(store, next);
    expect(await loadSettings(store)).toEqual(next);
  });

  it("falls back to defaults when stored settings are malformed", async () => {
    const store = new MemoryStore();
    await store.set("settings", { provider: "unknown-provider", autoLockMinutes: 0 });
    expect(await loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  it("refuses to save an out-of-range auto-lock timeout", async () => {
    await expect(
      saveSettings(new MemoryStore(), { ...DEFAULT_SETTINGS, autoLockMinutes: 0 }),
    ).rejects.toThrow();
  });
});
