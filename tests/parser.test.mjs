import test from "node:test";
import assert from "node:assert/strict";
import { parseReceipt } from "../src/parser.mjs";

test("uses grand total rather than subtotal, cash or change", () => {
  const result = parseReceipt(
    "FRESH MARKET\nSubtotal 350.00\nTax 30.00\nGRAND TOTAL BDT 380.00\nCash 500.00\nChange 120.00",
  );
  assert.equal(result.merchant, "FRESH MARKET");
  assert.equal(result.amountMinor, 38000);
  assert.equal(result.currency, "BDT");
  assert.equal(result.category, "Food");
});
test("supports Bangla digits and total labels", () => {
  assert.equal(
    parseReceipt("ঢাকা মার্কেট\nচাল ৮৫.০০\nসর্বমোট ৳ ৩৮০.০০").amountMinor,
    38000,
  );
});
test("conflicting totals require manual review", () => {
  assert.equal(
    parseReceipt("STORE\nTotal 380.00\nTotal 390.00").amountMinor,
    null,
  );
});
test("does not guess a total from item prices", () => {
  assert.equal(
    parseReceipt("GROCERY\nRice 380.00\nEggs 75.00").amountMinor,
    null,
  );
});
test("reads a total on the following line and comma grouped amount", () => {
  assert.equal(
    parseReceipt("SHOP\nGRAND TOTAL\nBDT 1,250.50").amountMinor,
    125050,
  );
});
test("reports foreign currency instead of assuming taka", () => {
  const result = parseReceipt("CAFE\nTOTAL $12.50");
  assert.equal(result.currency, "USD");
  assert.ok(result.warnings.some((value) => value.includes("Convert to BDT")));
});

test("recovers thermal-receipt totals when the payable label is damaged", () => {
  const text = [
    "LOCAL GROCERY",
    "Generic item Tooth £360.00 1.00 360.00",
    "2 £ $202407 Cleaning Sponge",
    "3 a Sub Total : 1,410.00 Bary",
    "ou Shoal: LOK 29",
    "é 2 ৯ (-) Discount : 100.00 সহ ie",
    "ns 1,310.0 ES",
    ": 130.0 oA",
    "Ym (#/-)ounding 1 0.00 Ko 17",
    "CC etPayable: 1000 :",
    "3 1,310.00",
    "** DISCOUNT ITEMS **",
    "100.00",
  ].join("\n");
  const result = parseReceipt(text);
  assert.equal(result.amountMinor, 131000);
  assert.equal(result.currency, null);
  assert.equal(result.totalSource, "verified-summary");
  assert.ok(result.warnings.some((value) => value.includes("Verify")));
});

test("summary arithmetic requires two matching independent observations", () => {
  assert.equal(
    parseReceipt("STORE\nSub Total 1410.00\nDiscount 100.00\n1310.00")
      .amountMinor,
    null,
  );
  assert.equal(
    parseReceipt("STORE\nSub Total 1410.00\nDiscount 100.00").amountMinor,
    null,
  );
});

test("does not infer net amounts when tax or payment adjustments are present", () => {
  assert.equal(
    parseReceipt(
      "STORE\nSub Total 1410.00\nTax 50.00\nDiscount 100.00\n1310.00\n1310.00",
    ).amountMinor,
    null,
  );
});

test("readable payable labels retain priority over arithmetic", () => {
  const result = parseReceipt(
    "STORE\nSub Total 1410.00\nDiscount 100.00\n1310.00\n1310.00\nNet Payable 1200.00",
  );
  assert.equal(result.amountMinor, 120000);
  assert.equal(result.totalSource, "label");
});

test("requested mode calculates subtotal minus discount without reading payable text", () => {
  const result = parseReceipt(
    "GROCERY\nSub Total: 1,410.00\nSub Total: 1,410.00\n(-) Discount: 100.00\ngarbled payable text",
    { calculationMode: "subtotal-minus-discount" },
  );
  assert.equal(result.subtotalMinor, 141000);
  assert.equal(result.discountMinor, 10000);
  assert.equal(result.amountMinor, 131000);
  assert.equal(result.totalSource, "subtotal-minus-discount");
});
test("subtotal mode does not add repeated subtotals or use coupon item discounts", () => {
  const result = parseReceipt(
    "STORE\nSubtotal: 1410.00\nSubtotal: 1410.00\nDiscount: 100.00\n** DISCOUNT ITEMS **\nItem Discount 25.00",
    { calculationMode: "subtotal-minus-discount" },
  );
  assert.equal(result.amountMinor, 131000);
});
test("subtotal mode refuses ambiguous subtotal or missing discount", () => {
  assert.equal(
    parseReceipt("STORE\nSubtotal 1410.00\nSubtotal 1510.00\nDiscount 100.00", {
      calculationMode: "subtotal-minus-discount",
    }).amountMinor,
    null,
  );
  assert.equal(
    parseReceipt("STORE\nSubtotal 1410.00", {
      calculationMode: "subtotal-minus-discount",
    }).amountMinor,
    null,
  );
});
test("subtotal mode accepts an explicit zero discount and rejects excessive discount", () => {
  assert.equal(
    parseReceipt("STORE\nSubtotal 1410.00\nDiscount 0.00", {
      calculationMode: "subtotal-minus-discount",
    }).amountMinor,
    141000,
  );
  assert.equal(
    parseReceipt("STORE\nSubtotal 1410.00\nDiscount 1500.00", {
      calculationMode: "subtotal-minus-discount",
    }).amountMinor,
    null,
  );
});

test("explicit currency codes take precedence over ambiguous dollar signs", () => {
  for (const currency of ["CAD", "AUD", "SGD", "AED", "SAR"]) {
    assert.equal(
      parseReceipt(`STORE\nTOTAL ${currency} $12.50`).currency,
      currency,
    );
  }
  assert.equal(
    parseReceipt("STORE\nTOTAL USD 12.50\nBDT 1400.00").currency,
    null,
  );
});
