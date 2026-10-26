import type { ProviderId } from "../settings";

export interface ModelRequest {
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface CompleteOptions {
  fetch: FetchLike;
  signal: AbortSignal;
}

// What an adapter needs to know about a provider. Adapters return raw model text.
// They never log, never retry, and never include the response body in an error.
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly label: string;
  // Host permission to request at runtime, in the form chrome.permissions expects.
  readonly origin: string;
  complete(request: ModelRequest, apiKey: string, options: CompleteOptions): Promise<string>;
}

export type ProviderErrorCode =
  | "KEY_REJECTED"
  | "RATE_LIMITED"
  | "HTTP_ERROR"
  | "NETWORK"
  | "TIMEOUT"
  | "BAD_RESPONSE";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly status?: number,
  ) {
    super(code);
    this.name = "ProviderError";
  }
}

// Runs a provider request and maps transport failures to ProviderError codes.
export async function send(
  url: string,
  init: RequestInit,
  options: CompleteOptions,
): Promise<unknown> {
  let response: Response;
  try {
    response = await options.fetch(url, { ...init, signal: options.signal });
  } catch {
    // The underlying error can contain URLs or request details, so it is dropped here.
    if (options.signal.aborted) {
      throw new ProviderError("TIMEOUT");
    }
    throw new ProviderError("NETWORK");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ProviderError("KEY_REJECTED", response.status);
  }
  if (response.status === 429) {
    throw new ProviderError("RATE_LIMITED", response.status);
  }
  if (!response.ok) {
    throw new ProviderError("HTTP_ERROR", response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderError("BAD_RESPONSE");
  }
}
