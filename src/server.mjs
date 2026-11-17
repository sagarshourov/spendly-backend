import http from "node:http";
import process from "node:process";
import { Buffer } from "node:buffer";
import { extractReceipt, prepareOcr, closeOcr, ReceiptError } from "./ocr.mjs";

const port = Number(process.env.PORT || 8787);
function json(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}
const server = http.createServer(async (request, response) => {
  // Browser preview support; native mobile requests do not use CORS.
  response.setHeader(
    "Access-Control-Allow-Origin",
    process.env.WEB_ORIGIN || "*",
  );
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    json(response, 200, { ready: true });
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/receipts/extract") {
    json(response, 404, { error: "Not found" });
    return;
  }
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    json(response, 415, { error: "Expected application/json" });
    return;
  }
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 12_000_000)
        throw new ReceiptError(
          "Image too large. Retake or crop your receipt.",
          413,
        );
      chunks.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ReceiptError("Invalid JSON request.", 400);
    }
    json(
      response,
      200,
      await extractReceipt(body?.imageBase64, {
        calculationMode:
          body?.calculationMode === "subtotal-minus-discount"
            ? "subtotal-minus-discount"
            : "payable",
      }),
    );
  } catch (error) {
    if (!response.destroyed)
      json(response, error instanceof ReceiptError ? error.status : 500, {
        error:
          error instanceof ReceiptError
            ? error.message
            : "Could not read this receipt. Please try a clearer image.",
      });
  }
});
server.requestTimeout = 60000;
await prepareOcr();
server.listen(port, "0.0.0.0", () =>
  console.log(`Receipt OCR ready on port ${port}`),
);
async function stop() {
  server.close();
  await closeOcr();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
