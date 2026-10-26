import { z } from "zod";
import type { KeyValueStore } from "./storage/store";

// Model names are inserted into a request path for Gemini, so they are restricted to
// a safe character set. Nothing with a slash, a space, or a query character gets through.
const ModelName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "invalid model name");

// Settings are not personal data, so they are stored outside the encrypted vault.
// Nothing secret belongs here.
export const SettingsSchema = z.strictObject({
  provider: z.enum(["gemini", "anthropic"]),
  models: z.strictObject({
    gemini: ModelName,
    anthropic: ModelName,
  }),
  autoLockMinutes: z.number().int().min(1).max(240),
  // Off by default. When on, field labels (never profile values) may go to the provider.
  modelAssistedAutofill: z.boolean(),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type ProviderId = Settings["provider"];

export const DEFAULT_SETTINGS: Settings = {
  provider: "gemini",
  models: {
    gemini: "gemini-3.8-flash",
    anthropic: "claude-sonnet-5-5",
  },
  autoLockMinutes: 15,
  modelAssistedAutofill: false,
};

const SETTINGS_KEY = "settings";

export async function loadSettings(store: KeyValueStore): Promise<Settings> {
  const parsed = SettingsSchema.safeParse(await store.get(SETTINGS_KEY));
  return parsed.success ? parsed.data : structuredClone(DEFAULT_SETTINGS);
}

export async function saveSettings(store: KeyValueStore, settings: Settings): Promise<void> {
  await store.set(SETTINGS_KEY, SettingsSchema.parse(settings));
}
