import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('privacy page is a standalone static HTML file in the public directory', async () => {
  const html = await readFile(new URL('../public/privacy-policy.html', import.meta.url), 'utf8');
  assert.match(html, /Privacy Policy/); assert.match(html, /Spendly AI/);
  assert.match(html, /Retention and deletion/); assert.match(html, /<style>/);
  assert.doesNotMatch(html, /\{\{/); assert.doesNotMatch(html, /\/styles\.css/);
});
test('Vercel maps health and privacy paths while retaining the extraction function', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.outputDirectory, 'public');
  assert.equal(config.rewrites.find(route => route.source === '/privacy-policy').destination, '/privacy-policy.html');
  assert.equal(config.rewrites.find(route => route.source === '/health').destination, '/api/health');
  assert.ok(config.functions['api/receipts/extract.mjs']);
});

test('Vercel package has no conventional persistent server entry point', async () => {
  const { access } = await import('node:fs/promises');
  await assert.rejects(access(new URL('../src/server.mjs', import.meta.url)));
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.start, 'node scripts/local-server.mjs');
});
