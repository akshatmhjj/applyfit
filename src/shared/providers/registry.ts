import type { ProviderId } from "../settings";
import { anthropicAdapter } from "./anthropic";
import { geminiAdapter } from "./gemini";
import type { ProviderAdapter } from "./provider";

// Exactly two providers, per PLAN.md. Adding a third needs a decision, not just a line here.
const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  gemini: geminiAdapter,
  anthropic: anthropicAdapter,
};

export function getProvider(id: ProviderId): ProviderAdapter {
  return ADAPTERS[id];
}
