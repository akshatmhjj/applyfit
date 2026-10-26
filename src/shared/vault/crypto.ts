import { z } from "zod";

// PBKDF2-SHA256 at 600,000 iterations follows OWASP's guidance for PBKDF2-HMAC-SHA256.
// It is also the minimum we accept when reading a stored vault, so a tampered
// blob cannot downgrade the key derivation.
export const KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const FORMAT_VERSION = 1;

export const KdfParamsSchema = z.strictObject({
  name: z.literal("PBKDF2"),
  hash: z.literal("SHA-256"),
  iterations: z.number().int().min(KDF_ITERATIONS),
  salt: z.string().min(1),
});
export type KdfParams = z.infer<typeof KdfParamsSchema>;

export const VaultBlobSchema = z.strictObject({
  version: z.literal(FORMAT_VERSION),
  kdf: KdfParamsSchema,
  iv: z.string().min(1),
  data: z.string().min(1),
});
export type VaultBlob = z.infer<typeof VaultBlobSchema>;

export class CryptoError extends Error {
  constructor(readonly code: "DECRYPT_FAILED") {
    super(code);
    this.name = "CryptoError";
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function newKdfParams(): KdfParams {
  return {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: KDF_ITERATIONS,
    salt: toBase64(randomBytes(SALT_BYTES)),
  };
}

// The derived key is non-extractable: JavaScript can use it, but cannot read its bytes.
export async function deriveKey(passphrase: string, kdf: KdfParams): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(kdf.salt),
      iterations: kdf.iterations,
      hash: kdf.hash,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// KDF parameters are bound as additional authenticated data. Changing the salt,
// iteration count, or version makes decryption fail instead of silently succeeding.
function additionalData(version: number, kdf: KdfParams): Uint8Array<ArrayBuffer> {
  return new Uint8Array(
    encoder.encode(JSON.stringify([version, kdf.name, kdf.hash, kdf.iterations, kdf.salt])),
  );
}

export async function seal(key: CryptoKey, kdf: KdfParams, plaintext: string): Promise<VaultBlob> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: additionalData(FORMAT_VERSION, kdf) },
    key,
    encoder.encode(plaintext),
  );
  return {
    version: FORMAT_VERSION,
    kdf,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function open(key: CryptoKey, blob: VaultBlob): Promise<string> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(blob.iv),
        additionalData: additionalData(blob.version, blob.kdf),
      },
      key,
      fromBase64(blob.data),
    );
    return decoder.decode(plaintext);
  } catch {
    // A wrong passphrase and a tampered blob look the same here, on purpose.
    throw new CryptoError("DECRYPT_FAILED");
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function fromBase64(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
