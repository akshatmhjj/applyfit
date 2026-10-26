# Job Fit & Autofill

A Chrome extension that will score how well a job posting fits your profile, autofill application forms from that profile after you confirm, and tailor your resume without inventing facts. Everything runs in your browser. You bring your own AI provider key.

> **Status: Phase 1 (foundation).** The side panel, the encrypted vault, and the settings page work. Job analysis, autofill, and resume tailoring are not built yet. See [PLAN.md](PLAN.md).

## Warning: your data goes to your AI provider

When Job Fit analysis and autofill are built, the job posting text and the profile data the feature needs will be sent to the AI provider you choose, using your own API key. That includes skills, job titles, years, and bullet text. Contact details are not sent. Read [PRIVACY.md](PRIVACY.md) for the exact list. Nothing is sent in this version.

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
2. **Add your API key** in Settings. It is stored encrypted, and it is not shown again after you save it.
3. **Edit your profile** in the side panel as JSON. Start from the shape in [profile.example.json](profile.example.json), which uses fake data. Save to store the profile encrypted.

The vault locks when you click **Lock now**, after the auto-lock timeout (15 minutes by default), and when the side panel closes.

## Develop

```bash
npm run check    # lint, typecheck, tests, build, and bundle check
npm test         # unit and security tests only
```

See [CLAUDE.md](CLAUDE.md) for the principles and working rules.

## License

MIT. See [LICENSE](LICENSE).
