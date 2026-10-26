import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // PBKDF2 at 600,000 iterations takes a few hundred milliseconds per derivation.
    testTimeout: 20_000,
  },
});
