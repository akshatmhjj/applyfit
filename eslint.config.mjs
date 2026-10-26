import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Security rules from the spec, enforced at lint time:
// untrusted text must never reach innerHTML, and no code may be built from strings.
const forbiddenSinks = [
  {
    selector: "MemberExpression[property.name=/^(innerHTML|outerHTML)$/]",
    message: "Use textContent or DOM APIs. innerHTML is forbidden (spec: untrusted page content).",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "insertAdjacentHTML is forbidden (spec: untrusted page content).",
  },
  {
    selector: "CallExpression[callee.name='eval'], CallExpression[callee.name='Function'], NewExpression[callee.name='Function']",
    message: "eval and Function constructors are forbidden (strict CSP).",
  },
];

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...forbiddenSinks],
    },
  },
);
