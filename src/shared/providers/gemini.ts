import { ProviderError, send, type CompleteOptions, type ModelRequest, type ProviderAdapter } from "./provider";

const ORIGIN = "https://generativelanguage.googleapis.com";

// The key travels in a header, never in the URL, so it cannot end up in logs or history.
export const geminiAdapter: ProviderAdapter = {
  id: "gemini",
  label: "Google Gemini",
  origin: `${ORIGIN}/*`,

  async complete(request: ModelRequest, apiKey: string, options: CompleteOptions): Promise<string> {
    const url = `${ORIGIN}/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: [{ text: request.user }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: request.maxOutputTokens,
        responseMimeType: "application/json",
      },
    };
    const data = await send(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      },
      options,
    );

    const text = readGeminiText(data);
    if (text === null) {
      throw new ProviderError("BAD_RESPONSE");
    }
    return text;
  },
};

function readGeminiText(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const candidates = (data as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const texts = parts
    .map((part) => (typeof part === "object" && part !== null ? (part as { text?: unknown }).text : undefined))
    .filter((text): text is string => typeof text === "string");
  return texts.length > 0 ? texts.join("") : null;
}
