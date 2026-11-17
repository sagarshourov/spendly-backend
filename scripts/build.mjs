import { readFile } from 'node:fs/promises';
for (const filename of ['index.html', 'privacy-policy.html']) {
  const html = await readFile(new URL(`../public/${filename}`, import.meta.url), 'utf8');
  if (!html.includes('<!doctype html>') || !html.includes('Spendly AI')) throw new Error(`Invalid public page: ${filename}`);
  if (filename === 'privacy-policy.html' && html.includes('YOUR_SUPPORT_EMAIL')) console.warn('Before submitting to Play Console: replace YOUR_SUPPORT_EMAIL in public/privacy-policy.html with your real support email.');
}
console.log('Public pages verified. Vercel will serve public/ and the Node.js API functions on the same domain.');
