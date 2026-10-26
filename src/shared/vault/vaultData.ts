import { z } from "zod";
import { ProfileSchema } from "../schemas/profile";

// Everything secret or personal lives inside the encrypted vault.
// Settings that are not personal (provider, model, timeouts) live outside it.
export const VaultDataSchema = z.strictObject({
  profile: ProfileSchema.nullable(),
  apiKey: z.string().min(1).max(512).nullable(),
});

export type VaultData = z.infer<typeof VaultDataSchema>;

export const EMPTY_VAULT_DATA: VaultData = { profile: null, apiKey: null };
