import { z } from "zod";
import type { KeyValueStore } from "./storage/store";

// Settings are not personal data, so they are stored outside the encrypted vault.
// Nothing secret belongs here.
export const SettingsSchema = z.strictObject({
  provider: z.enum(["anthropic"]),
  model: z.string().trim().min(1).max(100),
  autoLockMinutes: z.number().int().min(1).max(240),
  // Off by default. When on, field labels (never profile values) may go to the provider.
  modelAssistedAutofill: z.boolean(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  autoLockMinutes: 15,
  modelAssistedAutofill: false,
};

const SETTINGS_KEY = "settings";

export async function loadSettings(store: KeyValueStore): Promise<Settings> {
  const parsed = SettingsSchema.safeParse(await store.get(SETTINGS_KEY));
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
}

export async function saveSettings(store: KeyValueStore, settings: Settings): Promise<void> {
  await store.set(SETTINGS_KEY, SettingsSchema.parse(settings));
}
