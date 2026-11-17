import { createWorker } from "tesseract.js";
import sharp from "sharp";
import { createRequire } from "node:module";
import path from "node:path";
import { mkdir, copyFile, rename, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { tmpdir } from "node:os";
import { MAX_IMAGE_BASE64 } from "./limits.mjs";
import { parseReceipt } from "./parser.mjs";

const require = createRequire(import.meta.url);
const dataDirectory = path.join(tmpdir(), "spendly-ocr-models-v1");
let initialization;
let worker;
let busy = false;
export class ReceiptError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}
async function initializeWorker() {
  await mkdir(dataDirectory, { recursive: true });
  for (const language of ["eng", "ben"]) {
    const packageDirectory = path.dirname(
      require.resolve(`@tesseract.js-data/${language}/package.json`),
    );
    const destination = path.join(dataDirectory, `${language}.traineddata.gz`);
    const exists = await stat(destination).then(file => file.size > 0).catch(() => false);
    if (!exists) {
      const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
      await copyFile(path.join(packageDirectory, '4.0.0_best_int', `${language}.traineddata.gz`), temporary);
      await rename(temporary, destination);
    }
  }
  worker = await createWorker(["eng", "ben"], 1, {
    langPath: dataDirectory,
    cacheMethod: "none",
    gzip: true,
    // Avoid logging receipt text or full uploaded data.
    errorHandler: () => {},
  });
}
export async function prepareOcr() {
  if (worker) return worker;
  if (!initialization) {
    initialization = initializeWorker().catch((error) => { initialization = undefined; throw error; });
  }
  await initialization;
  return worker;
}
export async function extractReceipt(base64, options = {}) {
  if (busy)
    throw new ReceiptError("Scanner is busy. Please try again shortly.", 429);
  if (
    typeof base64 !== "string" ||
    base64.length < 16 ||
    base64.length > MAX_IMAGE_BASE64 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  ) {
    throw new ReceiptError(
      "Select a valid receipt image smaller than 2.4 MB.",
      400,
    );
  }
  busy = true;
  let timer;
  try {
    await prepareOcr();
    let image;
    try {
      image = await sharp(Buffer.from(base64, "base64"), {
        limitInputPixels: 25_000_000,
      })
        .rotate()
        .resize({ width: 1800, withoutEnlargement: true })
        .flatten({ background: "#FFFFFF" })
        .grayscale()
        .normalize()
        .png()
        .toBuffer();
    } catch {
      throw new ReceiptError(
        "This image could not be opened. Try another JPEG or PNG receipt.",
      );
    }
    const result = await Promise.race([
      worker.recognize(image),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new ReceiptError(
                "Reading took too long. Try a clearer, cropped receipt.",
                504,
              ),
            ),
          45000,
        );
      }),
    ]);
    const text = result.data.text.trim();
    if (text.length < 5)
      throw new ReceiptError(
        "No readable text found. Retake the photo in good light.",
      );
    return {
      ...parseReceipt(text, options),
      text,
      confidence: Math.round(result.data.confidence),
    };
  } catch (error) {
    if (error.status === 504) {
      const expired = worker;
      worker = null;
      await expired.terminate();
      initialization = undefined;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    // Release receipt-related worker memory after each request.
    try { await closeOcr(); } finally { busy = false; }
  }
}
export async function closeOcr() {
  const previous = worker;
  worker = null;
  initialization = undefined;
  if (previous) await previous.terminate();
}
