# Privacy

This file describes what the extension stores, where, what leaves your device, and how to delete it. It matches the code in this version. If the code changes data flow, this file changes in the same commit.

## Current version (Phase 1: foundation)

**Network: none.** This version makes no network requests. Analyze, Autofill, and resume tailoring are not built yet. When they are, this file will list exactly what is sent, to which provider, and when.

## What is stored, and where

All storage is `chrome.storage.local` on this device. Chrome does not sync this storage to other devices.

| Item | Stored as | Contents |
|---|---|---|
| Vault | Encrypted (AES-GCM-256). Key derived from your passphrase with PBKDF2-SHA256, 600,000 iterations, random salt. | Your profile (contact details, skills, experience, projects, education, preferences) and your provider API key. |
| Settings | Plaintext | Provider name, model name, auto-lock minutes, and the model-assisted autofill switch. No personal data. |

Nothing else is written. The API key is never stored in plaintext.

## What is kept in memory

While the vault is unlocked, the decrypted profile and API key live in the memory of the open page only. They are cleared when you lock the vault, after the auto-lock timeout (15 minutes of inactivity by default), or when the page closes.

The derived encryption key cannot be exported from the browser (it is created as non-extractable).

## What is logged

The extension logs only event codes and numeric counts, such as `profile.saved` with `{ "skills": 3 }`. It never logs profile values, job text, or keys.

## Passphrase

Your passphrase is never stored. If you forget it, your data cannot be recovered. There is no reset.

## How to delete everything

Remove the extension from `chrome://extensions`. Chrome deletes the extension's `chrome.storage.local` data when the extension is removed.

A "Delete all local data" button and an "Export my data" button are not built yet.
