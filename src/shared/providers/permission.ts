import type { ProviderAdapter } from "./provider";

// Asks for access to the provider's API host, and only that host. This must run directly
// from a user click, so call it before any other await in the click handler.
export async function ensureProviderHost(provider: ProviderAdapter): Promise<boolean> {
  const origins = [provider.origin];
  if (await chrome.permissions.contains({ origins })) {
    return true;
  }
  return chrome.permissions.request({ origins });
}
