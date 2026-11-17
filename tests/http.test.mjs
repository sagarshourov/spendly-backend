import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

test(
  "HTTP API accepts a receipt image and rejects malformed input",
  { timeout: 90000 },
  async () => {
    const port = 19000 + Math.floor(Math.random() * 10000);
    const child = spawn(process.execPath, ["scripts/local-server.mjs"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = once(child, "exit");
    let logs = "";
    child.stderr.on("data", (chunk) => {
      logs += chunk;
    });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Server did not start: " + logs)),
          30000,
        );
        child.stdout.on("data", (chunk) => {
          if (chunk.toString().includes("Receipt OCR ready")) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("Server exited: " + logs));
        });
      });
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 200);
      for (const pathname of ['/', '/privacy-policy', '/privacy-policy.html']) {
        const page = await fetch(`http://127.0.0.1:${port}${pathname}`);
        assert.equal(page.status, 200);
        assert.match(page.headers.get('content-type'), /text\/html/);
        assert.match(await page.text(), /Spendly AI/);
      }
      const svg =
        '<svg width="900" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><g font-family="DejaVu Sans" fill="black" font-size="40"><text x="80" y="100">FRESH MARKET</text><text x="80" y="220">Rice 85.00</text><text x="80" y="300">Milk 100.00</text><text x="80" y="420">TOTAL BDT 185.00</text></g></svg>';
      const image = await sharp(Buffer.from(svg)).png().toBuffer();
      const endpoint = `http://127.0.0.1:${port}/api/receipts/extract`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: image.toString("base64") }),
      });
      assert.equal(response.status, 200);
      const receipt = await response.json();
      assert.equal(receipt.merchant, "FRESH MARKET");
      assert.equal(receipt.amountMinor, 18500);
      assert.equal(receipt.currency, "BDT");
      assert.equal(
        (
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: "invalid" }),
          })
        ).status,
        400,
      );
      assert.equal(
        (await fetch(endpoint, { method: "POST", body: "{}" })).status,
        415,
      );
    } finally {
      child.kill("SIGTERM");
      await exited;
    }
  },
);
