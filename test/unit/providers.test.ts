import { describe, expect, it } from "vitest";
import { anthropicAdapter } from "../../src/shared/providers/anthropic";
import { geminiAdapter } from "../../src/shared/providers/gemini";
import { ProviderError, type FetchLike, type ModelRequest } from "../../src/shared/providers/provider";

const KEY = "AIza-test-key-not-real-0000000000";
const request: ModelRequest = {
  model: "gemini-2.5-flash",
  system: "SYSTEM PROMPT",
  user: "USER PROMPT",
  maxOutputTokens: 1000,
};

function fakeFetch(status: number, body: unknown, calls: { url: string; init: RequestInit }[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

const signal = new AbortController().signal;

describe("Gemini adapter", () => {
  it("sends the key in a header, never in the URL", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const body = { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] };
    const text = await geminiAdapter.complete(request, KEY, { fetch: fakeFetch(200, body, calls), signal });

    expect(text).toBe('{"ok":true}');
    expect(calls[0]?.url).not.toContain(KEY);
    expect(calls[0]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe(KEY);
  });

  it("puts the system prompt in systemInstruction and asks for JSON", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await geminiAdapter.complete(request, KEY, {
      fetch: fakeFetch(200, { candidates: [{ content: { parts: [{ text: "{}" }] } }] }, calls),
      signal,
    });
    const sent = JSON.parse(calls[0]?.init.body as string);
    expect(sent.systemInstruction.parts[0].text).toBe("SYSTEM PROMPT");
    expect(sent.contents[0].parts[0].text).toBe("USER PROMPT");
    expect(sent.generationConfig.responseMimeType).toBe("application/json");
    expect(sent.generationConfig.temperature).toBe(0);
  });

  it("maps 429 to RATE_LIMITED and 401 to KEY_REJECTED", async () => {
    await expect(
      geminiAdapter.complete(request, KEY, { fetch: fakeFetch(429, {}), signal }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(
      geminiAdapter.complete(request, KEY, { fetch: fakeFetch(401, {}), signal }),
    ).rejects.toMatchObject({ code: "KEY_REJECTED" });
  });

  it("rejects a response with no candidate text", async () => {
    await expect(
      geminiAdapter.complete(request, KEY, { fetch: fakeFetch(200, { candidates: [] }), signal }),
    ).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("maps a network failure to NETWORK and an aborted request to TIMEOUT", async () => {
    const broken: FetchLike = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(geminiAdapter.complete(request, KEY, { fetch: broken, signal })).rejects.toMatchObject({
      code: "NETWORK",
    });

    const controller = new AbortController();
    controller.abort();
    const aborting: FetchLike = async () => {
      throw new DOMException("aborted", "AbortError");
    };
    await expect(
      geminiAdapter.complete(request, KEY, { fetch: aborting, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("does not put the response body into the error", async () => {
    const error = await geminiAdapter
      .complete(request, KEY, { fetch: fakeFetch(500, { echo: "secret job text" }), signal })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(String((error as Error).message)).not.toContain("secret job text");
  });
});

describe("Anthropic adapter", () => {
  it("sends the key in x-api-key and returns text blocks", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const body = { content: [{ type: "text", text: '{"a":1}' }] };
    const text = await anthropicAdapter.complete(
      { ...request, model: "claude-sonnet-5-5" },
      KEY,
      { fetch: fakeFetch(200, body, calls), signal },
    );
    expect(text).toBe('{"a":1}');
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]?.url).not.toContain(KEY);
    expect((calls[0]?.init.headers as Record<string, string>)["x-api-key"]).toBe(KEY);
  });

  it("rejects a response with no text block", async () => {
    await expect(
      anthropicAdapter.complete(request, KEY, { fetch: fakeFetch(200, { content: [] }), signal }),
    ).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });
});
