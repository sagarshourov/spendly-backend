import { Buffer } from 'node:buffer';
import process from 'node:process';
import { ReceiptError, extractReceipt } from './ocr.mjs';
import { MAX_REQUEST_BYTES } from './limits.mjs';

export function setCors(response) {
  response.setHeader('Access-Control-Allow-Origin', process.env.WEB_ORIGIN || '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.setHeader('Cache-Control', 'no-store');
}
export function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}
export async function readJson(request) {
  let raw;
  // Vercel may already have parsed the body before invoking the handler.
  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === 'object' && !Buffer.isBuffer(request.body)) {
      if (Buffer.byteLength(JSON.stringify(request.body)) > MAX_REQUEST_BYTES) throw new ReceiptError('Image too large. Retake or crop your receipt.', 413);
      return request.body;
    }
    raw = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : request.body;
  } else {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) throw new ReceiptError('Image too large. Retake or crop your receipt.', 413);
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_REQUEST_BYTES) throw new ReceiptError('Image too large. Retake or crop your receipt.', 413);
  try { return JSON.parse(raw); } catch { throw new ReceiptError('Invalid JSON request.', 400); }
}
export async function receiptHandler(request, response) {
  setCors(response);
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST, OPTIONS'); json(response, 405, { error: 'Use POST to extract a receipt.' }); return; }
  if (!request.headers['content-type']?.startsWith('application/json')) { json(response, 415, { error: 'Expected application/json' }); return; }
  try {
    const body = await readJson(request);
    const result = await extractReceipt(body?.imageBase64, {
      calculationMode: body?.calculationMode === 'subtotal-minus-discount' ? 'subtotal-minus-discount' : 'payable',
    });
    json(response, 200, result);
  } catch (error) {
    if (!response.destroyed) json(response, error instanceof ReceiptError ? error.status : 500, {
      error: error instanceof ReceiptError ? error.message : 'Could not read this receipt. Please try a clearer image.',
    });
  }
}
