# Job Fit & Autofill

A Chrome extension that scores how well a job posting fits your profile. It will also autofill application forms from that profile after you confirm, and tailor your resume without inventing facts. You bring your own AI provider key.

> **Status: Phase 2 (job analysis) is built. Autofill and resume tailoring are not built yet.** See [PLAN.md](PLAN.md).

## Warning: your data goes to your AI provider

Analyze sends the job posting text and selected profile data (skill names, role titles, years, and bullet text) to the provider you choose, using your own API key. Contact details, company names, and links are never sent. Nothing is sent until you click Analyze and then Send. Read [PRIVACY.md](PRIVACY.md) for the exact list.

**Gemini's free tier** may let Google use prompts to improve its products. Use a billed key if that matters to you.

## Install from source

You need Node.js 24 (see `.nvmrc`) and npm.

```bash
npm ci
npm run build
```

Then load the extension:

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `dist/` folder inside this project.
4. Open the side panel from Chrome's side panel menu, and open **Settings** from the extension's options page.

## Set up

1. **Create a vault passphrase** in Settings. Use at least 12 characters. If you forget it, your data cannot be recovered.
2. **Choose a provider and paste its API key** in Settings. Gemini is the default. Keys are stored encrypted, and are not shown again after you save them.
3. **Edit your profile** in the side panel as JSON. Start from [profile.example.json](profile.example.json), which uses fake data. Save to store the profile encrypted.
4. **Open a job posting** in the active tab, open the side panel, and click **Analyze this job**.
6. **Resume help.** Click **Build checklist for this job** to see which skills to lead with and which bullets to move up. Click **Get AI suggestions** for reworded bullets (optional). Or click **Copy prompt for Claude**, paste it into a Claude chat, and add your own contact header to the result. The extension never rewrites your resume.
5. **Autofill a form.** Open the application page in the active tab, open the side panel, and click **Scan this form**. Check the fields you want, choose your resume PDF if the form asks for one, and click **Fill checked fields**. Nothing is submitted. Use the page's own submit button yourself. Check the summary, then click **Send**. The result shows the verdict (Apply, Apply with tailored resume, or Skip), your matched skills and gaps, and any hard stops such as a visa or location mismatch.

The vault locks when you click **Lock now**, after the auto-lock timeout (15 minutes by default), and when the side panel closes.

## Develop

```bash
npm run check    # lint, typecheck, tests, build, and bundle check
npm test         # unit and security tests only
```

See [CLAUDE.md](CLAUDE.md) for the principles and working rules.

## License

MIT. See [LICENSE](LICENSE).
