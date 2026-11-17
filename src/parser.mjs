const categories = [
  ["Health", /pharmacy|hospital|clinic|medicine|ডায়াগনস্টিক|ফার্মেসি/i],
  ["Transport", /uber|pathao|fuel|petrol|parking|transport|পেট্রোল/i],
  ["Bills", /electric|internet|utility|broadband|বিদ্যুৎ/i],
  [
    "Food",
    /food|grocery|grocer|market|restaurant|cafe|coffee|মার্কেট|রেস্টুরেন্ট/i,
  ],
  ["Shopping", /fashion|clothing|apparel|electronics|শপিং/i],
];
export function normalizeDigits(value) {
  return value.replace(/[০-৯]/g, (digit) =>
    String("০১২৩৪৫৬৭৮৯".indexOf(digit)),
  );
}
function amounts(line) {
  return [
    ...line.matchAll(
      /(?:^|[^\d])((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?![\d.])/g,
    ),
  ]
    .map((match) => {
      const [whole, decimal = ""] = match[1].replaceAll(",", "").split(".");
      return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    })
    .filter(
      (value) =>
        Number.isSafeInteger(value) && value > 0 && value <= 100_000_000,
    );
}
function selectRepeatedSummaryTotal(lines) {
  const start = lines.findIndex((line) => /s(?:u)?b\s*total/i.test(line));
  if (start < 0) return null;
  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      /discount\s*items|return\s*policy|terms\s*(?:and|&)/i.test(line),
  );
  const summary = lines.slice(start, end < 0 ? undefined : end);
  const subtotals = summary
    .filter((line) => /s(?:u)?b\s*total/i.test(line))
    .map((line) => amounts(line).at(-1))
    .filter(Boolean);
  const discounts = summary
    .filter((line) => /discount/i.test(line))
    .map((line) => amounts(line).at(-1))
    .filter(Boolean);
  const uniqueDiscounts = [...new Set(discounts)];
  if (!subtotals.length || uniqueDiscounts.length > 1) return null;
  // Restrict arithmetic fallback to simple subtotal-minus-discount summaries.
  // A tax/fee/tip/prepayment needs its own interpretation, so do not guess.
  if (
    summary.some((line) =>
      /tax|vat|service\s*charge|fee|tip|deposit|prepaid|advance|cash|tender|change/i.test(
        line,
      ),
    )
  )
    return null;
  const discount = uniqueDiscounts[0] ?? 0;
  const observations = new Map();
  for (const line of summary) {
    const withoutMoney = line.replace(
      /(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{1,2}/g,
      "",
    );
    const remainingLetters = withoutMoney.replace(
      /[^A-Za-z\u0980-\u09FF]/g,
      "",
    );
    const standalone = remainingLetters.length <= 4;
    const payment = /banking|card|payment|paid|b[kK]ash|nagad|rocket/i.test(
      line,
    );
    if (!standalone && !payment) continue;
    const value = amounts(line).at(-1);
    if (value) observations.set(value, (observations.get(value) ?? 0) + 1);
  }
  const corroborated = [
    ...new Set(subtotals.map((value) => value - discount)),
  ].filter((value) => value > 0 && (observations.get(value) ?? 0) >= 2);
  return corroborated.length === 1 ? corroborated[0] : null;
}

function detectCurrency(text) {
  // Only interpret symbols in amount/total context. A thermal-font letter or
  // border inside an item description is often mistaken for $, £ or €.
  const hasSymbolAmount = (symbol) => {
    const escaped = symbol === "$" ? "\\$" : symbol;
    return new RegExp(
      `(?:^\\s*|\\b(?:total|amount|due|payable|balance|price)\\b[^\\n]*?)${escaped}\\s*\\d[\\d,]*(?:\\.\\d{1,2})?(?!\\d)`,
      "im",
    ).test(text);
  };
  const explicit = [
    ...new Set(
      (
        text.match(/\b(?:BDT|USD|EUR|GBP|INR|AED|SAR|CAD|AUD|SGD)\b/gi) ?? []
      ).map((code) => code.toUpperCase()),
    ),
  ];
  if (explicit.length > 1) return null;
  if (explicit.length === 1) return explicit[0];
  if (/\bTK\.?\b|টাকা/i.test(text) || hasSymbolAmount("৳")) return "BDT";
  if (hasSymbolAmount("$")) return "USD";
  if (hasSymbolAmount("€")) return "EUR";
  if (hasSymbolAmount("£")) return "GBP";
  if (hasSymbolAmount("₹")) return "INR";
  return null;
}

function uniqueSummaryValue(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 1) return ranked[0][0];
  if (ranked.length > 1 && ranked[0][1] >= 2 && ranked[0][1] > ranked[1][1])
    return ranked[0][0];
  return null;
}

export function extractSubtotalDiscount(text) {
  const lines = normalizeDigits(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const cutoff = lines.findIndex((line) =>
    /discount\s*items|return\s*policy/i.test(line),
  );
  const summary = cutoff < 0 ? lines : lines.slice(0, cutoff);
  const subtotals = [];
  const discounts = [];
  for (let index = 0; index < summary.length; index++) {
    const line = summary[index];
    const isSubtotal = /\bs(?:u)?b\s*total\b/i.test(line);
    const isDiscount =
      /\bdiscount\b|ছাড়/i.test(line) &&
      !/discount\s*(?:rate|percent)|%/i.test(line);
    if (!isSubtotal && !isDiscount) continue;
    // Search after the label so register/item numbers before it are ignored.
    const label = isSubtotal ? /s(?:u)?b\s*total/i : /discount|ছাড়/i;
    const labelMatch = label.exec(line);
    const suffix = line.slice(labelMatch.index + labelMatch[0].length);
    const found = amounts(suffix);
    let value = found.at(-1);
    if (value === undefined && /^\s*[:=-]?\s*0(?:\.0{1,2})?\s*$/.test(suffix))
      value = 0;
    if (
      value === undefined &&
      summary[index + 1] &&
      /^[\s৳$€£\d.,A-Z]+$/.test(summary[index + 1])
    )
      value = amounts(summary[index + 1]).at(-1);
    if (value !== undefined) (isSubtotal ? subtotals : discounts).push(value);
  }
  const subtotalMinor = uniqueSummaryValue(subtotals);
  const discountMinor = uniqueSummaryValue(discounts);
  const amountMinor =
    subtotalMinor !== null &&
    discountMinor !== null &&
    subtotalMinor > discountMinor
      ? subtotalMinor - discountMinor
      : null;
  return { subtotalMinor, discountMinor, amountMinor };
}

export function parseReceipt(text, { calculationMode = "payable" } = {}) {
  const lines = normalizeDigits(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (
      /sub\s*total|subtotal|cash|tender|change|discount|tax\s+total|মোট ছাড়/i.test(
        line,
      )
    )
      continue;
    const strong =
      /grand\s*total|total\s*(?:due|payable)|amount\s*(?:due|payable)|net\s*(?:total|payable)|সর্বমোট|পরিশোধযোগ্য/i.test(
        line,
      );
    if (!strong && !/\btotal\b|মোট/i.test(line)) continue;
    const values = amounts(line);
    const next =
      !values.length &&
      lines[index + 1] &&
      /^[\s৳$€£\d.,A-Z]+$/.test(lines[index + 1])
        ? amounts(lines[index + 1])
        : [];
    const value = values.at(-1) ?? next.at(-1);
    if (value) candidates.push({ value, rank: strong ? 2 : 1 });
  }
  const rank = Math.max(0, ...candidates.map((item) => item.rank));
  const totals = [
    ...new Set(
      candidates.filter((item) => item.rank === rank).map((item) => item.value),
    ),
  ];
  // Conflicting totals remain blank for review rather than guessing.
  const labelledTotal = totals.length === 1 ? totals[0] : null;
  const repeatedTotal = selectRepeatedSummaryTotal(lines);
  // Never override conflicting readable payable labels with inferred arithmetic.
  let amountMinor = totals.length > 1 ? null : (labelledTotal ?? repeatedTotal);
  let totalSource = labelledTotal
    ? "label"
    : repeatedTotal && amountMinor
      ? "verified-summary"
      : null;
  const summary = extractSubtotalDiscount(text);
  if (calculationMode === "subtotal-minus-discount") {
    amountMinor = summary.amountMinor;
    totalSource = amountMinor !== null ? "subtotal-minus-discount" : null;
  }
  const merchant =
    lines
      .slice(0, 5)
      .find(
        (line) =>
          /[A-Za-z\u0980-\u09FF]/.test(line) &&
          !/receipt|invoice|tax invoice|date:|tel:|phone:|www\.|https?:|cashier/i.test(
            line,
          ),
      )
      ?.slice(0, 80) ?? "";
  const currency = detectCurrency(normalizeDigits(text));
  const category =
    categories.find(([, pattern]) => pattern.test(text))?.[0] ?? "Other";
  const warnings = [];
  if (calculationMode === "subtotal-minus-discount") {
    if (summary.subtotalMinor === null)
      warnings.push(
        "Subtotal could not be read reliably. Enter it from the receipt.",
      );
    if (summary.discountMinor === null)
      warnings.push(
        "Discount could not be read reliably. Enter it, or enter 0 if there is no discount.",
      );
    if (
      summary.subtotalMinor !== null &&
      summary.discountMinor !== null &&
      amountMinor === null
    )
      warnings.push(
        "Discount must be smaller than subtotal. Check both amounts.",
      );
  }
  if (!merchant && calculationMode !== "subtotal-minus-discount")
    warnings.push("Merchant could not be identified.");
  if (!amountMinor && calculationMode !== "subtotal-minus-discount")
    warnings.push(
      "Total is missing or ambiguous. Enter the total shown on the receipt.",
    );
  if (totalSource === "verified-summary")
    warnings.push(
      "Total was recovered from repeated summary amounts and subtotal-minus-discount arithmetic. Verify it against the printed payable amount.",
    );
  if (!currency)
    warnings.push(
      "Currency could not be identified. Confirm this is a BDT receipt.",
    );
  if (currency && currency !== "BDT")
    warnings.push(
      `Detected ${currency}. Convert to BDT yourself before saving; this app does not convert currencies.`,
    );
  return {
    merchant,
    amountMinor,
    category,
    currency,
    warnings,
    totalSource,
    subtotalMinor: summary.subtotalMinor,
    discountMinor: summary.discountMinor,
  };
}
