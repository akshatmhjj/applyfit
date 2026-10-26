# Privacy

This file describes what the extension stores, where, what leaves your device, and how to delete it. It matches the code in this version. If the code changes data flow, this file changes in the same commit.

## What leaves your device

Nothing leaves your device until you click **Analyze this job** and then **Send** in the side panel. Each send is one request to the provider you chose in Settings. Gemini is the default.

**Sent with each Analyze:**

- **The job posting text**, up to 15,000 characters, read from the active tab. This is page text. The page URL is not sent.
- **From your profile:** skill names and years, role titles with start and end dates, and bullet text.
- **Never sent:** your name, email, phone, city, links, company names, school names, project names, or your provider API key in any form except the request header.
- **Scrubbed before sending:** any email address, URL, phone number, or contact detail that appears inside your bullet text is replaced with `[removed]`. A final check blocks the send if any such text remains.

The side panel shows a summary of what is being sent, with counts, and waits for your confirmation.

**Sent to:** only the provider you choose.

- **Google Gemini** (default): `generativelanguage.googleapis.com`. Your API key is sent in an `x-goog-api-key` header.
- **Anthropic**: `api.anthropic.com`. Your API key is sent in an `x-api-key` header.

The extension asks Chrome for permission to reach the chosen provider only when you click Analyze.

**Free tier warning.** Google's free-tier terms may allow Google to use prompts sent on the free tier to improve its products. The job text and your skill names are part of those prompts. Check Google's current terms before you use a free key. A billed key avoids this use under Google's paid terms. The extension shows this warning in Settings and in the send confirmation when Gemini is selected.

## What is stored, and where

All storage is `chrome.storage.local` on this device. Chrome does not sync this storage to other devices.

| Item | Stored as | Contents |
|---|---|---|
| Vault | Encrypted (AES-GCM-256). Key derived from your passphrase with PBKDF2-SHA256, 600,000 iterations, random salt. | Your profile and your provider API key. |
| Settings | Plaintext | Provider name, a model name for each provider, auto-lock minutes, and the model-assisted autofill switch. No personal data. |

Analysis results are shown in the side panel and are not saved. Nothing else is written.

## What is kept in memory

While the vault is unlocked, the decrypted profile and API key live in the memory of the open page only. They are cleared when you lock the vault, after the auto-lock timeout (15 minutes of inactivity by default), or when the page closes.

The derived encryption key cannot be exported from the browser.

## What is logged

The extension logs only event codes and numeric counts, such as `analyze.started` with `{ "jobChars": 1234, "skills": 3 }`. It never logs profile values, job text, model output, or keys.

## Resume help

- **Checklist:** runs entirely on your device, with no network request. It suggests skills to lead with, bullets to move up, and bullets that may not help this job.
- **AI suggestions:** only when you click **Get AI suggestions** and then **Send**. The request holds the job text and the ids and text of your bullets and skills. It never holds your contact details, company names, school names, or links. Suggestions are checked before you see them: any that refer to unknown items, or add a number, tool, or name that the original bullet does not contain, are dropped.
- **Copy prompt for Claude:** copies a prompt to your clipboard only when you click the button. The prompt holds the job text and your resume facts, but not your contact details. The extension does not send it anywhere. You paste it into an AI chat yourself.

## Autofill

Autofill reads the form on the active tab and writes only the fields you check in the preview. It sends nothing to any provider unless you have turned on model-assisted mapping (off by default).

- **Never filled:** passwords, payment details, government ID numbers, security questions, and files other than your resume.
- **Needs your answer:** self-identification questions (gender, race, disability, veteran status, pronouns) and legal or work-authorisation questions (visa, sponsorship, criminal history). These are never answered for you.
- **Your resume PDF** is chosen in the side panel for each fill. It is read into memory, attached to the form, and is not stored.

**Model-assisted mapping, if turned on:** the provider receives the labels, names, and placeholders of fields the rules could not place. It receives no profile values and no values you have typed into the form. The request is blocked if any label contains one of your contact details. Its answer may only pick a profile field from the fixed list. Anything else is rejected.

Nothing is submitted by the extension. You click the page's own submit button.

## Passphrase

Your passphrase is never stored. If you forget it, your data cannot be recovered. There is no reset.

## How to delete everything

Remove the extension from `chrome://extensions`. Chrome deletes the extension's `chrome.storage.local` data when the extension is removed. Also revoke the API key in your provider's console.

A "Delete all local data" button and an "Export my data" button are not built yet.
