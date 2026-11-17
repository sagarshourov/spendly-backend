import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import receiptHandler from '../api/receipts/extract.mjs';
import healthHandler from '../api/health.mjs';
import { MAX_REQUEST_BYTES } from '../src/limits.mjs';
function response() {
  return { status: 0, payload: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, writeHead(code, headers) { this.status = code; Object.assign(this.headers, headers); }, end(value) { this.payload = value ? JSON.parse(value) : null; } };
}
test('Vercel health does not need OCR initialization', () => {
  const res = response(); healthHandler({ method: 'GET' }, res);
  assert.equal(res.status, 200); assert.equal(res.payload.ready, true);
});
test('Vercel handler accepts pre-parsed JSON, lazily initializes OCR and returns subtotal minus discount', { timeout: 60000 }, async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="100%" height="100%" fill="white"/><g font-family="DejaVu Sans" font-size="40"><text x="80" y="100">FRESH MARKET</text><text x="80" y="250">Sub Total BDT 1410.00</text><text x="80" y="350">Discount 100.00</text><text x="80" y="500">Net Payable 1310.00</text></g></svg>';
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const res = response();
  await receiptHandler({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { imageBase64: image.toString('base64'), calculationMode: 'subtotal-minus-discount' } }, res);
  assert.equal(res.status, 200); assert.equal(res.payload.subtotalMinor, 141000);
  assert.equal(res.payload.discountMinor, 10000); assert.equal(res.payload.amountMinor, 131000);
});
test('Vercel handler returns useful method and payload errors', async () => {
  const get = response(); await receiptHandler({method:'GET',headers:{}},get); assert.equal(get.status,405);
  const options = response(); await receiptHandler({method:'OPTIONS',headers:{}},options); assert.equal(options.status,204);
  const invalid = response(); await receiptHandler({method:'POST',headers:{'content-type':'application/json'},body:{}},invalid); assert.equal(invalid.status,400);
  const large = response(); await receiptHandler({method:'POST',headers:{'content-type':'application/json'},body:{imageBase64:'a'.repeat(MAX_REQUEST_BYTES)}},large); assert.equal(large.status,413);
});
