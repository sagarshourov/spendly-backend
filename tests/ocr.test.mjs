import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { closeOcr, extractReceipt, prepareOcr } from "../src/ocr.mjs";

test(
  "recognizes an actual receipt image with bundled local models",
  { timeout: 90000 },
  async () => {
    const svg = `<svg width="1000" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><g fill="black" font-family="DejaVu Sans" font-size="38"><text x="80" y="120">FRESH MARKET</text><text x="80" y="200">Dhaka, Bangladesh</text><text x="80" y="360">Rice 85.00</text><text x="80" y="440">Milk 100.00</text><text x="80" y="520">Eggs 75.00</text><text x="80" y="600">Vegetables 120.00</text><text x="80" y="760">GRAND TOTAL BDT 380.00</text><text x="80" y="880">Thank you</text></g></svg>`;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    try {
      await prepareOcr();
      const result = await extractReceipt(image.toString("base64"));
      assert.equal(result.amountMinor, 38000);
      assert.equal(result.currency, "BDT");
      assert.match(result.merchant, /FRESH MARKET/);
      await assert.rejects(
        extractReceipt("not-a-valid-image"),
        /valid receipt/,
      );
      await assert.rejects(
        extractReceipt(Buffer.from("invalid-image-content").toString("base64")),
        /could not be opened/,
      );
    } finally {
      await closeOcr();
    }
  },
);

test(
  "real thermal receipt photo regression",
  { timeout: 90000, skip: !process.env.RECEIPT_REGRESSION_IMAGE },
  async () => {
    const { readFile } = await import("node:fs/promises");
    try {
      await prepareOcr();
      const image = await readFile(process.env.RECEIPT_REGRESSION_IMAGE);
      const result = await extractReceipt(image.toString("base64"));
      assert.equal(result.amountMinor, 131000);
      assert.equal(result.currency, null);
      assert.equal(result.totalSource, "verified-summary");
      const summary = await extractReceipt(image.toString("base64"), {
        calculationMode: "subtotal-minus-discount",
      });
      assert.equal(summary.subtotalMinor, 141000);
      assert.equal(summary.discountMinor, 10000);
      assert.equal(summary.amountMinor, 131000);
      assert.equal(summary.totalSource, "subtotal-minus-discount");
    } finally {
      await closeOcr();
    }
  },
);
