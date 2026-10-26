import { ProviderError, send, type CompleteOptions, type ModelRequest, type ProviderAdapter } from "./provider";

const ORIGIN = "https://api.anthropic.com";

// The key travels in a header, never in the URL.
export const anthropicAdapter: ProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  origin: `${ORIGIN}/*`,

  async complete(request: ModelRequest, apiKey: string, options: CompleteOptions): Promise<string> {
    const body = {
      model: request.model,
      max_tokens: request.maxOutputTokens,
      temperature: 0,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
    };
    const data = await send(
      `${ORIGIN}/v1/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
      options,
    );

    const text = readAnthropicText(data);
    if (text === null) {
      throw new ProviderError("BAD_RESPONSE");
    }
    return text;
  },
};

function readAnthropicText(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const texts = content
    .filter((block) => (block as { type?: unknown }).type === "text")
    .map((block) => (block as { text?: unknown }).text)
    .filter((text): text is string => typeof text === "string");
  return texts.length > 0 ? texts.join("") : null;
}
