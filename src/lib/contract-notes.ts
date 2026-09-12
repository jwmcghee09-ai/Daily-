/**
 * Broker contract-note parser.
 *
 * Australian retail brokers don't expose trading APIs, but they all email a
 * confirmation for every trade. Users forward those to their personal SPECTRE
 * address and we read the trade out of them — which is the only approach that
 * works across CommSec, Selfwealth, Stake and the rest without a third party.
 *
 * Everything here is pure and deterministic: text in, structured trade out. The
 * parsers never trust the email — every field is validated and range-checked,
 * and anything that doesn't parse cleanly is surfaced for the user to confirm
 * rather than silently applied to their holdings.
 */

export type TradeSide = "buy" | "sell";

export interface ParsedTrade {
  broker: string;
  side: TradeSide;
  ticker: string;
  units: number;
  unitPrice: number;
  /** Total consideration including brokerage, when the note states it. */
  total: number | null;
  brokerage: number | null;
  /** ISO date (YYYY-MM-DD) when the note states one. */
  tradeDate: string | null;
  currency: string;
  confirmation: string | null;
  /** 0–1. Below 1 means at least one field was inferred rather than read. */
  confidence: number;
  notes: string[];
}

export interface ParseResult {
  trades: ParsedTrade[];
  broker: string | null;
  /** Why nothing was extracted, when trades is empty. */
  reason?: string;
}

const MAX_UNITS = 100_000_000;
const MAX_PRICE = 1_000_000;

/** Strip HTML to plain text without pulling in a parser dependency. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|table|h[1-6])>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "\t")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Matches an optional currency prefix: "$", "US$", "A$", "AUD", "USD " etc. */
const MONEY = String.raw`(?:(?:AUD|USD|NZD|US|AU|NZ|A)\s*)?\$?\s*`;

function num(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Normalise the many date shapes brokers use into YYYY-MM-DD. */
export function normaliseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Australian order: day first.
  const dmyNumeric = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(text);
  if (dmyNumeric) {
    const [, d, m, y] = dmyNumeric;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const dmyName = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(text);
  if (dmyName) {
    const month = MONTHS[dmyName[2].slice(0, 3).toLowerCase()];
    if (month) return `${dmyName[3]}-${month}-${dmyName[1].padStart(2, "0")}`;
  }
  return null;
}

function cleanTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 12);
}

/** Reject anything physically implausible before it can reach a portfolio. */
function validate(trade: ParsedTrade): ParsedTrade | null {
  if (!trade.ticker || trade.ticker.length < 1) return null;
  if (!Number.isFinite(trade.units) || trade.units <= 0 || trade.units > MAX_UNITS) return null;
  if (!Number.isFinite(trade.unitPrice) || trade.unitPrice <= 0 || trade.unitPrice > MAX_PRICE) return null;

  // Cross-check the stated total against units × price; flag a mismatch rather
  // than trusting either number blindly.
  if (trade.total != null && trade.total > 0) {
    const implied = trade.units * trade.unitPrice;
    const drift = Math.abs(trade.total - implied) / implied;
    if (drift > 0.25) {
      trade.notes.push(
        `Stated total ${trade.total.toFixed(2)} differs from units × price (${implied.toFixed(2)}) — check before applying.`,
      );
      trade.confidence = Math.min(trade.confidence, 0.5);
    }
  }
  return trade;
}

function detectSide(text: string): TradeSide | null {
  if (/\b(bought|buy|purchase[d]?)\b/i.test(text)) return "buy";
  if (/\b(sold|sell|disposal)\b/i.test(text)) return "sell";
  return null;
}

// ── Broker-specific parsers ──────────────────────────────────────────────────

/**
 * CommSec confirmations state the trade as a sentence, e.g.
 * "You bought 300 BHP at $41.20" plus a details block underneath.
 */
function parseCommSec(text: string): ParsedTrade[] {
  const trades: ParsedTrade[] = [];
  const pattern =
    new RegExp(String.raw`\bYou\s+(bought|sold)\b[^\n]*?([\d,]+(?:\.\d+)?)\s+(?:units?\s+of\s+|shares?\s+of\s+)?([A-Z]{1,6})\b[^\n]*?(?:at|@)\s*` + MONEY + String.raw`([\d,]+\.?\d*)`, "gi");

  for (const m of text.matchAll(pattern)) {
    const units = num(m[2]);
    const price = num(m[4]);
    if (units == null || price == null) continue;

    const window = text.slice(m.index ?? 0, (m.index ?? 0) + 1200);
    trades.push(
      buildTrade({
        broker: "CommSec",
        side: m[1].toLowerCase() === "bought" ? "buy" : "sell",
        ticker: m[3],
        units,
        price,
        window,
        confidence: 0.95,
      }),
    );
  }
  return trades;
}

/** Selfwealth and Stake use a labelled details block rather than a sentence. */
function parseLabelled(text: string, broker: string): ParsedTrade[] {
  const side = detectSide(text);
  if (!side) return [];

  const ticker =
    /(?:^|\n)\s*(?:Code|Symbol|Ticker|Security)\s*[:\t]\s*([A-Z0-9.]{1,12})/im.exec(text)?.[1];
  const units = num(/(?:^|\n)\s*(?:Units|Quantity|Qty|Shares)\s*[:\t]\s*([\d,]+(?:\.\d+)?)/im.exec(text)?.[1]);
  const price = num(
    new RegExp(String.raw`(?:^|\n)\s*(?:Unit Price|Avg(?:erage)? Price|Price per (?:unit|share)|Price)\s*[:\t]\s*` + MONEY + String.raw`([\d,]+\.?\d*)`, "im").exec(text)?.[1],
  );
  if (!ticker || units == null || price == null) return [];

  return [buildTrade({ broker, side, ticker, units, price, window: text, confidence: 0.9 })];
}

/**
 * Last resort: a note we don't recognise, but which still states a side, a
 * code, a quantity and a price somewhere. Deliberately low confidence so it
 * always lands in review.
 */
function parseGeneric(text: string): ParsedTrade[] {
  const side = detectSide(text);
  if (!side) return [];

  const combined =
    /\b(?:bought|sold|buy|sell)\b[^\n]{0,60}?([\d,]+(?:\.\d+)?)\s+(?:units?|shares?)?\s*(?:of\s+)?([A-Z]{2,6})\b[^\n]{0,40}?(?:at|@|\$)\s*\$?\s*([\d,]+\.?\d*)/i.exec(text);
  if (!combined) return [];

  const units = num(combined[1]);
  const price = num(combined[3]);
  if (units == null || price == null) return [];

  const trade = buildTrade({
    broker: "Unknown broker",
    side,
    ticker: combined[2],
    units,
    price,
    window: text,
    confidence: 0.55,
  });
  trade.notes.push("Broker not recognised — figures were read from a generic pattern. Check them carefully.");
  return [trade];
}

function buildTrade(input: {
  broker: string;
  side: TradeSide;
  ticker: string;
  units: number;
  price: number;
  window: string;
  confidence: number;
}): ParsedTrade {
  const { window } = input;
  const brokerage = num(
    new RegExp(String.raw`(?:Brokerage|Commission|Fee)s?\s*[:\t]?\s*` + MONEY + String.raw`([\d,]+\.?\d*)`, "i").exec(window)?.[1],
  );
  const total = num(
    new RegExp(String.raw`(?:Total|Net|Consideration|Total Cost|Amount)\s*(?:Value|Amount|Cost)?\s*[:\t]?\s*` + MONEY + String.raw`([\d,]+\.?\d*)`, "i").exec(window)?.[1],
  );
  const tradeDate = normaliseDate(
    /(?:Trade Date|Date of Trade|Transaction Date|Settlement Date|Date)\s*[:\t]?\s*([0-9A-Za-z/\-. ]{6,20})/i.exec(window)?.[1]?.trim(),
  );
  const confirmation =
    /(?:Confirmation|Contract Note|Reference|Order)\s*(?:Number|No\.?|ID|#)?\s*[:\t]?\s*([A-Z0-9\-]{4,24})/i
      .exec(window)?.[1] ?? null;
  const currency = /\bUSD\b|\bUS\$/i.test(window) && !/\bAUD\b/i.test(window) ? "USD" : "AUD";

  return {
    broker: input.broker,
    side: input.side,
    ticker: cleanTicker(input.ticker),
    units: input.units,
    unitPrice: input.price,
    total,
    brokerage,
    tradeDate,
    currency,
    confirmation,
    confidence: input.confidence,
    notes: [],
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

function detectBroker(text: string, from: string): string | null {
  const haystack = `${from} ${text}`.toLowerCase();
  if (haystack.includes("commsec") || haystack.includes("commonwealth securities")) return "CommSec";
  if (haystack.includes("selfwealth")) return "Selfwealth";
  if (haystack.includes("stake.com.au") || /\bstake\b/.test(haystack)) return "Stake";
  if (haystack.includes("pearler")) return "Pearler";
  if (haystack.includes("superhero")) return "Superhero";
  if (haystack.includes("nabtrade") || haystack.includes("nab trade")) return "nabtrade";
  return null;
}

/**
 * Parse a forwarded confirmation email into trades.
 * @param subject email subject line
 * @param body    plain text body (HTML should be passed through htmlToText first)
 * @param from    sender address, used only as a hint for broker detection
 */
export function parseContractNote(subject: string, body: string, from = ""): ParseResult {
  const text = `${subject}\n${body}`.replace(/\r/g, "");
  if (text.trim().length < 20) return { trades: [], broker: null, reason: "Email body was empty." };

  const broker = detectBroker(text, from);

  let trades: ParsedTrade[] = [];
  if (broker === "CommSec") trades = parseCommSec(text);
  if (!trades.length && broker) trades = parseLabelled(text, broker);
  if (!trades.length) trades = parseCommSec(text);
  if (!trades.length) trades = parseLabelled(text, broker ?? "Unknown broker");
  if (!trades.length) trades = parseGeneric(text);

  const valid = trades.map(validate).filter((t): t is ParsedTrade => t !== null);

  // De-duplicate: a forwarded thread can repeat the same note in the quoted tail.
  const seen = new Set<string>();
  const unique = valid.filter((t) => {
    const key = `${t.side}|${t.ticker}|${t.units}|${t.unitPrice}|${t.tradeDate ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!unique.length) {
    return {
      trades: [],
      broker,
      reason: broker
        ? `Recognised a ${broker} email but couldn't find a trade in it. Forward the confirmation itself rather than a summary or statement.`
        : "No trade details found. Forward a trade confirmation or contract note.",
    };
  }
  return { trades: unique, broker };
}
