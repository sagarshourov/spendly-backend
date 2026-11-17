# Spendly AI backend + privacy policy — one Vercel domain

This folder includes your OCR backend adapted to Vercel Node.js functions, plus public HTML pages. Upload this folder's **contents** to your Git repository root. There is no need for a separate Vercel project for the privacy policy.

## Project structure

```text
api/
  health.mjs
  receipts/extract.mjs
public/
  index.html
  privacy-policy.html
src/
  http.mjs
  limits.mjs
  ocr.mjs
  parser.mjs
scripts/build.mjs
package.json
package-lock.json
vercel.json
```

- `public/` is served as static website content.
- `api/` contains serverless Node.js entry points.
- `scripts/local-server.mjs` remains available for local/Docker use. Vercel does not start a permanent `npm start` server.
- OCR models are copied to `/tmp` at runtime, because the deployed source directory is read-only.
- The function configuration includes Tesseract worker/core files, language models and Sharp native dependencies.

## Before publishing the privacy page

Open `public/privacy-policy.html` and replace **every** `YOUR_SUPPORT_EMAIL` with your real public support/privacy email. Confirm that developer name **Sagar Roy**, app name **Spendly AI**, and the described app behavior match your Play Store listing and release. The file uses inline styles and needs no other CSS files.

The build warns if the email placeholder remains. It does not silently invent an email address or block your backend deployment. Do not submit the policy URL to Play Console until that placeholder is replaced.

## Vercel import settings

Create/import a Vercel project from your Git repository using:

| Setting | Value |
| --- | --- |
| Root Directory | Folder containing `package.json` and `vercel.json` (`.` if at repository root) |
| Framework Preset | Other |
| Node.js Version | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `public` |

These settings are also supplied in `vercel.json`. Use the included lockfile. No privacy email environment variable is required in this version; edit the HTML directly.

After deployment, both the API and privacy policy use the same project domain or custom domain:

| Purpose | Path | Method |
| --- | --- | --- |
| Homepage | `/` | GET |
| Privacy policy | `/privacy-policy` | GET |
| Privacy policy, direct file | `/privacy-policy.html` | GET |
| Health check | `/health` or `/api/health` | GET |
| Receipt extraction | `/api/receipts/extract` | POST |

Example addresses (replace the sample project name):

```text
https://YOUR-PROJECT.vercel.app/privacy-policy
https://YOUR-PROJECT.vercel.app/health
https://YOUR-PROJECT.vercel.app/api/receipts/extract
```

Use the privacy-policy URL in Play Console and provide a link to it inside your app. Confirm that it opens in a private/incognito browser without a Vercel login or password prompt. Setting a custom domain in this Vercel project applies to both the static pages and API paths.

## Connect the React Native app

In the mobile app's `.env` file:

```dotenv
EXPO_PUBLIC_RECEIPT_API_URL=https://YOUR-PROJECT.vercel.app
```

Set the **base domain only**, without `/api` or `/api/receipts/extract`. The app appends the extraction path. Restart Expo after changing the environment variable:

```bash
npx expo start --clear
```

No backend secrets should be placed in EXPO_PUBLIC variables.

## Local verification

```bash
npm ci
npm run build
npm run check
npm test
npm start
```

Open `http://localhost:8787/privacy-policy` and `http://localhost:8787/health`. The same local server also accepts POST requests at `/api/receipts/extract`.

The tests verify the HTML routes and receipt API on the same host, Vercel's pre-parsed JSON request format, OCR initialization and field extraction, malformed/oversized requests and existing receipt parsing behavior. The optional real-photo regression needs `RECEIPT_REGRESSION_IMAGE`; the private image is not included.

## Hosting limits and current behavior

Vercel limits request bodies to 4.5 MB. This service caps image base64 at 3,200,000 characters and total JSON at 3,600,000 bytes, leaving room for headers/platform differences. If an existing mobile build submits a bigger image, it must resize/compress the photo or ask for a smaller crop. The OCR function timeout is configured for 60 seconds; cold starts and CPU capacity affect latency.

OCR runs on the Node.js runtime, not Edge. The API returns 429 if the same function instance is already reading another receipt; the app can retry. The health check verifies endpoint availability rather than warming the OCR engine. The service releases the worker after each scan and does not intentionally save receipt images/text to permanent storage.

This package has no account authentication, and public hosting can incur usage charges. Add appropriate authentication and usage controls before a broad production rollout. Browser CORS can be restricted using `WEB_ORIGIN`; CORS is not native-mobile authentication.

## What has and has not been checked

The package is prepared and tested locally. It has not been pushed to GitHub or deployed to a live Vercel account. Verify a real receipt through the production URL after your first deployment. This is an OCR backend and website package, not an Android/iOS application build.

Official references:

- https://vercel.com/docs/functions/runtimes/node-js
- https://vercel.com/docs/project-configuration/vercel-json
- https://vercel.com/docs/functions/limitations
- https://support.google.com/googleplay/android-developer/answer/9859455


## Replace the old deployed repository version

Your earlier local-server project has `src/server.mjs` and a root `privacy-policy.html`. This Vercel project uses dedicated `api/` functions and public static pages instead.

1. Upload the contents of this folder into the repository root. Keep the whole `public/`, `api/`, `scripts/` and `src/` folders and the root configuration/package files.
2. **Delete the old `src/server.mjs` from GitHub.** The replacement local-only server is `scripts/local-server.mjs`; `npm start` uses it. Leaving the old conventional server entry can cause Vercel to detect the wrong application entry point.
3. Remove the old root `privacy-policy.html` after confirming `public/privacy-policy.html` is present.
4. Commit your changes. In Vercel, use Framework Other, Root Directory `.`, Build `npm run build`, Output `public`, Node 22.x. Redeploy the latest commit.
5. Check `/privacy-policy.html`, `/privacy-policy` and `/health` before trying a receipt.

Do not copy only the privacy HTML file into the old local-server repository; deploy the complete combined configuration. No GitHub changes or Vercel publication were performed by the assistant.
