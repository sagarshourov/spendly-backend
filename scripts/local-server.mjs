import http from 'node:http';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { receiptHandler, json } from '../src/http.mjs';
import health from '../api/health.mjs';
import { prepareOcr, closeOcr } from '../src/ocr.mjs';
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const server = http.createServer(async (request, response) => {
  const route = new URL(request.url, 'http://localhost').pathname;
  if (route === '/health' || route === '/api/health') return health(request, response);
  if (route === '/api/receipts/extract') return receiptHandler(request, response);
  const files = { '/': 'index.html', '/privacy-policy': 'privacy-policy.html', '/privacy-policy.html': 'privacy-policy.html', '/styles.css': 'styles.css' };
  if (request.method === 'GET' && files[route]) {
    try {
      const contents = await readFile(path.join(publicDirectory, files[route]));
      response.writeHead(200, { 'Content-Type': route.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8' });
      response.end(contents); return;
    } catch { json(response, 503, { error: 'Public pages are not built. Set PRIVACY_CONTACT_EMAIL and run npm run build.' }); return; }
  }
  json(response, 404, { error: 'Not found' });
});
server.requestTimeout = 60000;
await prepareOcr();
server.listen(Number(process.env.PORT || 8787), '0.0.0.0', () => console.log(`Receipt OCR ready on port ${process.env.PORT || 8787}`));
async function stop() { server.close(); await closeOcr(); process.exit(0); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
