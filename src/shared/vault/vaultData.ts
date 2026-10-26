import { z } from "zod";
import { ProfileSchema } from "../schemas/profile";

// The default resume is kept as raw PDF bytes, base64 encoded, inside the encrypted vault.
// Chrome's local storage quota is 10 MB, so the limit leaves room for the encoding and the
// encryption overhead.
export const MAX_RESUME_BYTES = 2 * 1024 * 1024;

export const ResumeSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  mimeType: z.literal("application/pdf"),
  base64: z.string().min(1),
  uploadedAt: z.string().max(40),
});

export type StoredResume = z.infer<typeof ResumeSchema>;

// Everything secret or personal lives inside the encrypted vault.
// Settings that are not personal (provider, model, timeouts) live outside it.
export const VaultDataSchema = z.strictObject({
  profile: ProfileSchema.nullable(),
  apiKey: z.string().min(1).max(512).nullable(),
  resume: ResumeSchema.nullable(),
});

export type VaultData = z.infer<typeof VaultDataSchema>;

export const EMPTY_VAULT_DATA: VaultData = { profile: null, apiKey: null, resume: null };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

// Checks that the bytes are a PDF and within the size limit. The name is only a label.
export function checkResumeBytes(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "The file is empty.";
  if (bytes.length > MAX_RESUME_BYTES) return "The file is larger than 2 MB. Choose a smaller PDF.";
  const isPdf = PDF_MAGIC.every((byte, index) => bytes[index] === byte);
  return isPdf ? null : "That file is not a PDF.";
}
