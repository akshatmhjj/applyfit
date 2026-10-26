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

  it("defaults to Gemini, the provider the user chose", () => {
    expect(DEFAULT_SETTINGS.provider).toBe("gemini");
  });

  it("keeps model-assisted autofill off by default (privacy)", () => {
    expect(DEFAULT_SETTINGS.modelAssistedAutofill).toBe(false);
  });

  it("auto-locks after 15 minutes by default", () => {
    expect(DEFAULT_SETTINGS.autoLockMinutes).toBe(15);
  });

  it("round-trips saved settings", async () => {
    const store = new MemoryStore();
    const next = {
      ...DEFAULT_SETTINGS,
      provider: "anthropic" as const,
      autoLockMinutes: 5,
      models: { ...DEFAULT_SETTINGS.models, anthropic: "claude-haiku-5-5" },
    };
    await saveSettings(store, next);
    expect(await loadSettings(store)).toEqual(next);
  });

  it("falls back to defaults when stored settings are malformed", async () => {
    const store = new MemoryStore();
    await store.set("settings", { provider: "unknown-provider", autoLockMinutes: 0 });
    expect(await loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  it("refuses an out-of-range auto-lock timeout", async () => {
    await expect(
      saveSettings(new MemoryStore(), { ...DEFAULT_SETTINGS, autoLockMinutes: 0 }),
    ).rejects.toThrow();
  });

  it("refuses model names that could change the request URL", async () => {
    for (const model of ["gemini-2.5-flash/../../x", "a?key=1", "x y", "", "-leading"]) {
      await expect(
        saveSettings(new MemoryStore(), {
          ...DEFAULT_SETTINGS,
          models: { ...DEFAULT_SETTINGS.models, gemini: model },
        }),
      ).rejects.toThrow();
    }
  });
});
