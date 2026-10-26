# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems.

Report privately through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Include the version, the steps to reproduce, and what you expected to happen. Do not include real profile data, API keys, or job-page content from a live site. Use the fake data in `profile.example.json` where possible.

We aim to acknowledge reports within a few days. There is no bug bounty.

## Scope

In scope:
- Anything that could expose the profile, API key, or job text outside the device or the chosen provider.
- Ways to bypass the vault passphrase or auto-lock.
- Ways for page content to run code, click, submit, or change extension state.
- Permission or CSP weaknesses in `src/manifest.json`.

Out of scope:
- Attacks that need access to an unlocked browser profile.
- Reports about a provider's own service.

## Design commitments

The design is in `PLAN.md`. The main security properties are:

- Profile and API key are encrypted at rest with a passphrase-derived key.
- Job-page text and model output are treated as untrusted data.
- The extension never submits a form.
- The extension requests no host access except the provider you choose, at runtime.
