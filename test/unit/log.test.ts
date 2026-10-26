import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "../../src/shared/log";

describe("logEvent", () => {
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    info.mockRestore();
  });

  it("writes only the event code and numeric counts", () => {
    logEvent("profile.saved", { skills: 3, bullets: 12 });
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({ code: "profile.saved", counts: { skills: 3, bullets: 12 } }),
    );
  });

  it("cannot be given free text by the type system", () => {
    // @ts-expect-error free-text codes are rejected at compile time
    logEvent("Acme Corp: senior engineer job text");
    // @ts-expect-error counts must be numbers, not profile values
    logEvent("profile.saved", { email: "alex@example.com" });
  });
});
