import Papa from "papaparse";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { countUserHoldings, readUserEntitlements, saveImport, saveImportMulti } from "@/lib/db";
import {
  attachDemoGuestCookie,
  createDemoGuestContext,
  DEMO_GUEST_MAX_UPLOADS,
  getDemoGuestContext,
  incrementDemoGuestUploadCount,
} from "@/lib/demo-guest";
import { CsvRow, DataSource, extractCsvDataSection, parseRowsToHoldings, PortfolioHolding } from "@/lib/portfolio";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_BODY_BYTES = 12 * 1024 * 1024;
const TEXT_UPLOAD_EXTENSIONS = new Set(["csv", "txt", "tsv", "psv", "json"]);
const WORKBOOK_UPLOAD_EXTENSIONS = new Set(["xlsx", "xls", "xlsm", "xlsb", "numbers", "ods"]);
// Screenshots of a broker / super / crypto / bullion app, read with a vision model.
const IMAGE_UPLOAD_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([...TEXT_UPLOAD_EXTENSIONS, ...WORKBOOK_UPLOAD_EXTENSIONS, ...IMAGE_UPLOAD_EXTENSIONS]);
const SUPPORTED_UPLOAD_FORMATS_LABEL = "CSV, TSV, PSV, TXT, JSON, XLSX, XLS, XLSM, XLSB, NUMBERS, ODS, or a screenshot (PNG, JPG, WEBP)";
const INVALID_UPLOAD_FORMAT_MESSAGE = `Does not accept this file type. Please convert to - ${SUPPORTED_UPLOAD_FORMATS_LABEL}.`;

interface ImportCsvPayload {
  source?: unknown;
  csvText?: unknown;
  fileName?: unknown;
  fileBase64?: unknown;
  // Natural-language fallback: the user describes their holdings in plain
  // English (e.g. when a screenshot won't parse) and the AI structures them.
  description?: unknown;
}

interface ImportCandidate {
  label: string;
  text: string;
}

function isValidSource(value: unknown): value is DataSource {
  return value === "super" || value === "asx" || value === "us" || value === "gold" || value === "index" || value === "fund" || value === "crypto" || value === "tax" || value === "savings";
}

function isValidParsedHolding(value: unknown): value is PortfolioHolding {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PortfolioHolding>;
  return typeof candidate.id === "string" && typeof candidate.ticker === "string" && Number.isFinite(candidate.value);
}

function parseBody(rawBody: string): ImportCsvPayload {
  const parsed = JSON.parse(rawBody) as unknown;
  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  return parsed as ImportCsvPayload;
}

function getExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(dotIndex + 1).toLowerCase();
}

function decodeBase64File(fileBase64: string): Buffer {
  try {
    return Buffer.from(fileBase64, "base64");
  } catch {
    return Buffer.alloc(0);
  }
}

function imageMimeFor(extension: string): string {
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

const VISION_SYSTEM_PROMPT =
  `You read a screenshot of an investment account (a broker, super fund, crypto exchange, or bullion dealer — app or website) and extract the holdings it shows.
Return ONLY a JSON object of the form {"holdings": [ ... ]}. Each holding is an object with these keys; use null when a value is not visible, and NEVER invent numbers:
- "ticker": the symbol or code (e.g. "BHP", "AAPL", "BTC", "VAS"); for a fund use its code, for crypto the coin symbol.
- "name": the security or fund name.
- "units": quantity / shares / units / coins held, as a number.
- "price": current price per unit, as a number.
- "value": current market value of the position, as a number.
- "account": the account, platform, or wallet name if shown.
Numbers must be plain — no currency symbols, thousands separators, or % signs. Do NOT report cost base, purchase price, profit/loss or returns even if the screenshot shows them — only current holdings. Skip totals, subtotals, cash lines, and summary rows. If the image shows no holdings, return {"holdings": []}.`;

/**
 * Read holdings out of a portfolio screenshot with a vision model, returning
 * rows in the same shape the CSV path produces so they flow through
 * parseRowsToHoldings unchanged. Uses the app's existing OpenAI configuration.
 */
async function extractHoldingRowsFromImage(
  fileBase64: string,
  extension: string,
): Promise<{ rows: CsvRow[]; error: string | null }> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return { rows: [], error: "Screenshot import isn't set up on this server yet." };
  }
  const base = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = String(process.env.OPENAI_VISION_MODEL || "gpt-4o").trim();
  const dataUri = `data:${imageMimeFor(extension)};base64,${fileBase64}`;

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: VISION_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the holdings from this screenshot." },
              { type: "image_url", image_url: { url: dataUri, detail: "high" } },
            ],
          },
        ],
      }),
    });
  } catch {
    return { rows: [], error: "The screenshot reader timed out. Please try again." };
  }
  if (!res.ok) {
    return { rows: [], error: "Couldn't read the screenshot right now. Please try again in a moment." };
  }

  let content = "";
  try {
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    content = data.choices?.[0]?.message?.content ?? "";
  } catch {
    return { rows: [], error: "Couldn't read the screenshot." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { rows: [], error: "Couldn't make sense of the screenshot. Try a clearer, closer image." };
  }
  // A screenshot shows current holdings, not what you paid. Drop any cost /
  // purchase / profit field so performance is never fabricated from a guessed
  // cost base — the cost base defaults to the current value (zero P/L) instead.
  const rows = coerceJsonRows(parsed).map((row) => {
    const clean: CsvRow = {};
    for (const [key, cell] of Object.entries(row)) {
      if (/cost|purchase|avg|average|book|profit|gain|loss|pnl|p[/.]l|return/i.test(key)) continue;
      clean[key] = cell;
    }
    return clean;
  });
  return { rows, error: null };
}

const DESCRIBE_SYSTEM_PROMPT =
  `You turn a person's plain-English description of their investments into structured holdings.
Return ONLY a JSON object of the form {"holdings": [ ... ]}. Each holding is an object with these keys; use null when the person didn't say, and NEVER invent numbers:
- "ticker": the symbol or code (e.g. "BHP", "AAPL", "BTC", "VAS"). If they give only a company or fund name you confidently know, use its ticker; if unsure, use null.
- "name": the security, fund, or asset name as they described it.
- "units": quantity / shares / units / coins held, as a number.
- "price": price per unit, as a number, only if they state one.
- "value": total current dollar value of the position, as a number, only if they state one.
- "account": the platform, super fund, wallet, or account if mentioned.
Numbers must be plain — no currency symbols, thousands separators, or % signs. Do NOT infer or report cost base, purchase price, profit/loss or returns even if mentioned — only the current holding. For a cash-like balance (savings, a super balance in dollars), set units to 1 and value to the dollar amount. If no holdings are described, return {"holdings": []}.`;

/**
 * Turn a plain-English description of holdings into rows in the same shape the
 * CSV/screenshot paths produce, so they flow through parseRowsToHoldings
 * unchanged. The "describe it to the AI" fallback for when a screenshot won't
 * parse. Uses the app's existing OpenAI configuration.
 */
async function extractHoldingRowsFromText(
  description: string,
): Promise<{ rows: CsvRow[]; error: string | null }> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return { rows: [], error: "Describe-your-holdings import isn't set up on this server yet." };
  }
  const base = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = String(process.env.OPENAI_CLASSIFY_MODEL || "gpt-4o-mini").trim();

  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: DESCRIBE_SYSTEM_PROMPT },
          { role: "user", content: description },
        ],
      }),
    });
  } catch {
    return { rows: [], error: "The assistant timed out. Please try again." };
  }
  if (!res.ok) {
    return { rows: [], error: "Couldn't process that right now. Please try again in a moment." };
  }

  let content = "";
  try {
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    content = data.choices?.[0]?.message?.content ?? "";
  } catch {
    return { rows: [], error: "Couldn't read the assistant's reply." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { rows: [], error: "Couldn't make sense of that. Try naming each holding and how many units — e.g. \"10 Apple shares, 0.5 Bitcoin\"." };
  }
  // Same guard as the screenshot path: never accept a cost/purchase/P&L field,
  // so performance is never fabricated from a described (or guessed) cost base.
  const rows = coerceJsonRows(parsed).map((row) => {
    const clean: CsvRow = {};
    for (const [key, cell] of Object.entries(row)) {
      if (/cost|purchase|avg|average|book|profit|gain|loss|pnl|p[/.]l|return/i.test(key)) continue;
      clean[key] = cell;
    }
    return clean;
  });
  return { rows, error: null };
}

// ── Auto-classification: let the AI decide what each holding is ────────────
const VALID_SOURCES = new Set(["super", "asx", "us", "gold", "index", "fund", "crypto", "tax", "savings"]);

const DEFAULT_ACCOUNT: Record<DataSource, string> = {
  super: "Superannuation",
  savings: "Savings Account",
  tax: "Tax Records",
  gold: "ABC Bullion",
  index: "Index Holdings",
  fund: "Mutual Funds",
  crypto: "Crypto Wallet",
  us: "Global Holdings",
  asx: "Brokerage",
};

const CRYPTO_SYMBOLS = new Set([
  "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT", "MATIC", "POL", "LTC", "BCH", "LINK", "AVAX", "UNI",
  "ATOM", "XLM", "ALGO", "TRX", "SHIB", "BNB", "USDT", "USDC", "DAI", "NEAR", "APT", "ARB", "OP", "SUI",
  "PEPE", "TON", "FIL", "ICP", "HBAR", "VET", "INJ", "RNDR", "RENDER", "GRT", "AAVE", "MKR", "SAND", "MANA",
  "AXS", "FTM", "EGLD", "XMR", "ETC", "THETA", "XTZ", "EOS", "CRO", "QNT", "KAS", "TAO", "WLD", "JUP", "SEI",
]);

/** A fast, free guess used when the AI is unavailable or skips a holding. */
function classifySourceHeuristic(ticker: string, name: string): DataSource {
  const rawT = (ticker || "").toUpperCase();
  const t = rawT.replace(/\.AX$/, "").replace(/[-/](AUD|USD|USDT|USDC)$/, "").trim();
  const hay = `${rawT} ${name || ""}`.toLowerCase();
  if (/\b(gold|silver|platinum|palladium|bullion|xau|xag)\b|perth mint|abc bullion|pmgold/.test(hay)) return "gold";
  if (CRYPTO_SYMBOLS.has(t) || /\b(bitcoin|ethereum|crypto|binance|solana|cardano|polkadot|dogecoin|coinbase|kraken|coinspot)\b|\bcoin\b/.test(hay)) return "crypto";
  if (/\b(super|superannuation|pension|retirement|smsf)\b/.test(hay)) return "super";
  if (/\betf\b|\bindex\b|index fund|vanguard|ishares|betashares|\bspdr\b|\bvas\b|\bvgs\b|\bivv\b|\bstw\b|\bndq\b|\ba200\b|\bvts\b|\bveu\b/.test(hay)) return "index";
  if (/managed fund|mutual fund|\bfund\b|wholesale fund/.test(hay)) return "fund";
  if (rawT.endsWith(".AX")) return "asx";
  if (/\b(nasdaq|nyse)\b/.test(hay)) return "us";
  return "asx";
}

const CLASSIFY_SYSTEM_PROMPT =
  `You sort investment holdings into categories. Return ONLY JSON of the form {"holdings":[{"i":1,"category":"asx"}, ...]} — one entry per holding, keeping its number. Categories:
- "asx": shares on the Australian Securities Exchange (e.g. BHP, CBA, CSL, MQG).
- "us": shares on US or other overseas markets (e.g. AAPL, MSFT, NVDA, TSLA).
- "crypto": cryptocurrencies and tokens (e.g. BTC, ETH, SOL).
- "gold": physical gold, silver or other bullion.
- "index": index ETFs (e.g. VAS, IVV, VGS, A200, NDQ).
- "fund": managed or mutual funds that are not simple index ETFs.
- "super": superannuation balances or investment options.
- "savings": cash or savings accounts.
- "tax": tax or franking records.
Pick the single best category for each. When unsure between asx and us, use the ticker's real listing exchange.`;

/** Assign each holding's source by asking the AI; fall back to the heuristic. */
async function classifyHoldingSources(holdings: PortfolioHolding[]): Promise<void> {
  if (holdings.length === 0) return;
  const aiSources: (DataSource | null)[] = holdings.map(() => null);
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (apiKey) {
    try {
      const base = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
      const model = String(process.env.OPENAI_CLASSIFY_MODEL || "gpt-4o-mini").trim();
      const list = holdings.map((h, i) => `${i + 1}. ${h.ticker} — ${h.name}`).join("\n");
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: CLASSIFY_SYSTEM_PROMPT },
            { role: "user", content: `Classify these holdings:\n${list}` },
          ],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { holdings?: Array<{ i?: number; category?: string }> };
        for (const row of parsed.holdings ?? []) {
          const idx = typeof row.i === "number" ? row.i - 1 : -1;
          const cat = String(row.category || "").toLowerCase();
          if (idx >= 0 && idx < holdings.length && VALID_SOURCES.has(cat)) {
            aiSources[idx] = cat as DataSource;
          }
        }
      }
    } catch {
      // Fall back to the heuristic below.
    }
  }
  holdings.forEach((holding, i) => {
    const classified = aiSources[i] ?? classifySourceHeuristic(holding.ticker, holding.name);
    if (classified !== holding.source) {
      // Replace a neutral default account so the category reads right; a real
      // account name carried from the file is left alone.
      if (holding.account === DEFAULT_ACCOUNT.asx) holding.account = DEFAULT_ACCOUNT[classified];
      holding.source = classified;
    }
  });
}

function parseWorkbookToCsvCandidates(fileBuffer: Buffer): ImportCandidate[] {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", dense: true });
  const candidates: ImportCandidate[] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      continue;
    }

    const csvText = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
    if (csvText.trim().length === 0) {
      continue;
    }

    candidates.push({
      label: `sheet:${sheetName}`,
      text: csvText,
    });
  }

  return candidates;
}

function toImportCandidates(payload: ImportCsvPayload): { candidates: ImportCandidate[]; error: string | null } {
  const csvText = typeof payload.csvText === "string" ? payload.csvText : "";
  if (csvText.trim().length > 0) {
    return { candidates: [{ label: "inline-text", text: csvText }], error: null };
  }

  const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
  const fileBase64 = typeof payload.fileBase64 === "string" ? payload.fileBase64.trim() : "";
  if (!fileName || !fileBase64) {
    return { candidates: [], error: "CSV content is required." };
  }

  const extension = getExtension(fileName);
  if (!SUPPORTED_UPLOAD_EXTENSIONS.has(extension)) {
    return {
      candidates: [],
      error: INVALID_UPLOAD_FORMAT_MESSAGE,
    };
  }

  const fileBuffer = decodeBase64File(fileBase64);
  if (fileBuffer.length === 0) {
    return { candidates: [], error: "Uploaded file could not be decoded." };
  }
  if (fileBuffer.length > MAX_IMPORT_FILE_BYTES) {
    return { candidates: [], error: "Import file is too large. Max 2MB file size." };
  }

  if (WORKBOOK_UPLOAD_EXTENSIONS.has(extension)) {
    let workbookCandidates: ImportCandidate[] = [];
    try {
      workbookCandidates = parseWorkbookToCsvCandidates(fileBuffer);
    } catch {
      return { candidates: [], error: "Workbook file could not be parsed." };
    }
    if (workbookCandidates.length === 0) {
      return { candidates: [], error: "Workbook file appears empty." };
    }
    return { candidates: workbookCandidates, error: null };
  }

  const textValue = fileBuffer.toString("utf8");
  if (textValue.trim().length === 0) {
    return { candidates: [], error: "Text file appears empty." };
  }

  return { candidates: [{ label: fileName, text: textValue }], error: null };
}

function coerceJsonRows(value: unknown): CsvRow[] {
  const toRow = (record: Record<string, unknown>): CsvRow => {
    return Object.entries(record).reduce<CsvRow>((acc, [key, cell]) => {
      if (cell == null || typeof cell === "string" || typeof cell === "number") {
        acc[key] = cell;
      } else if (typeof cell === "boolean") {
        acc[key] = cell ? "true" : "false";
      } else {
        acc[key] = JSON.stringify(cell);
      }
      return acc;
    }, {});
  };

  const toRows = (items: unknown[]): CsvRow[] => {
    return items
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item) => toRow(item));
  };

  if (Array.isArray(value)) {
    return toRows(value);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const container = value as Record<string, unknown>;
  const keys = ["holdings", "rows", "data", "items", "transactions", "positions"];
  for (const key of keys) {
    const candidate = container[key];
    if (Array.isArray(candidate)) {
      const rows = toRows(candidate);
      if (rows.length > 0) {
        return rows;
      }
    }
  }

  const singleRow = toRow(container);
  return Object.keys(singleRow).length > 0 ? [singleRow] : [];
}

function parseCandidateRows(text: string): { rows: CsvRow[]; parsedAny: boolean } {
  const normalized = extractCsvDataSection(text);
  const trimmed = normalized.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsedJson = JSON.parse(trimmed) as unknown;
      const jsonRows = coerceJsonRows(parsedJson);
      if (jsonRows.length > 0) {
        return { rows: jsonRows, parsedAny: true };
      }
    } catch {
      // Fall back to CSV parser below.
    }
  }

  const parsed = Papa.parse<CsvRow>(normalized, {
    header: true,
    skipEmptyLines: true,
    delimiter: "",
    transformHeader: (header) => header.trim(),
  });

  return {
    rows: parsed.data || [],
    parsedAny: parsed.data.length > 0 || parsed.errors.length === 0,
  };
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    const url = new URL(request.url);
    const allowDemoGuest = url.searchParams.get("demo") === "1";
    let demoGuest = !sessionUser && allowDemoGuest ? await getDemoGuestContext() : null;
    let createdDemoGuest = false;

    if (!sessionUser && allowDemoGuest && !demoGuest) {
      demoGuest = createDemoGuestContext();
      createdDemoGuest = true;
    }

    if (!sessionUser && !demoGuest) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    // Rate limit demo guests by IP to prevent resource abuse
    if (demoGuest) {
      const { getClientAddress } = await import("@/lib/auth");
      const ip = getClientAddress(request);
      const demoRate = consumeRateLimit(`import:demo:${ip}`, 10, 60 * 1000);
      if (!demoRate.allowed) {
        return NextResponse.json(
          { error: "Too many import requests. Please wait a moment." },
          { status: 429, headers: { "Retry-After": String(demoRate.retryAfterSec) } },
        );
      }
    }

    if (sessionUser) {
      const { getClientAddress } = await import("@/lib/auth");
      const ip = getClientAddress(request);
      const importRate = consumeRateLimit(`import:${sessionUser.id}:${ip}`, 20, 60 * 1000);
      if (!importRate.allowed) {
        return NextResponse.json(
          { error: "Too many import requests. Please wait a moment." },
          { status: 429, headers: { "Retry-After": String(importRate.retryAfterSec) } },
        );
      }
    }

    if (sessionUser) {
      const entitlements = readUserEntitlements(sessionUser.id);
      if (entitlements.planTier === "none") {
        const existing = countUserHoldings(sessionUser.id);
        if (existing >= 4) {
          return NextResponse.json(
            { error: "Starter plan is limited to 4 investments. Upgrade to Plus to import unlimited holdings.", upgradeRequired: true },
            { status: 403 },
          );
        }
      }
    }

    if (demoGuest && demoGuest.uploadCount >= DEMO_GUEST_MAX_UPLOADS) {
      const response = NextResponse.json(
        {
          error: `Demo upload limit reached. You can import up to ${DEMO_GUEST_MAX_UPLOADS} files per guest session.`,
          demoGuest,
        },
        { status: 403 },
      );
      if (createdDemoGuest) {
        attachDemoGuestCookie(response, demoGuest.userId, demoGuest.expiresAt);
      }
      return response;
    }

    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BODY_BYTES) {
      return NextResponse.json({ error: "Import request is too large." }, { status: 413 });
    }

    const rawBody = await request.text();
    const bodyBytes = new TextEncoder().encode(rawBody).length;
    if (bodyBytes > MAX_IMPORT_BODY_BYTES) {
      return NextResponse.json({ error: "Import request is too large." }, { status: 413 });
    }

    let payload: ImportCsvPayload;
    try {
      payload = parseBody(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    // "auto" means: don't make the user pick a category — extract the holdings,
    // then let the AI classify what each one is (see below).
    const isAuto = payload.source === "auto";
    if (!isAuto && !isValidSource(payload.source)) {
      return NextResponse.json({ error: "Invalid source. Must be 'auto', 'super', 'asx', 'us', 'gold', 'index', 'fund', 'crypto', 'tax', or 'savings'." }, { status: 400 });
    }
    // While extracting, auto holdings are built under a neutral source; their real
    // source is assigned by classification before they are saved.
    const buildSource: DataSource = isAuto ? "asx" : (payload.source as DataSource);

    let bestHoldings: PortfolioHolding[] = [];
    let bestTotalRows = 0;
    let parsedAnyCandidate = false;

    const uploadFileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
    const isImageUpload = IMAGE_UPLOAD_EXTENSIONS.has(getExtension(uploadFileName));
    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    const hasCsvText = typeof payload.csvText === "string" && payload.csvText.trim().length > 0;
    const isDescribe = description.length > 0 && !isImageUpload && !hasCsvText;

    if (isDescribe) {
      // "Describe it to the AI" fallback — structure the plain-English holdings
      // with the same row → holding → classify pipeline as a file/screenshot.
      if (description.length > 2000) {
        return NextResponse.json({ error: "That description is too long. Please keep it under 2000 characters." }, { status: 400 });
      }
      const extracted = await extractHoldingRowsFromText(description);
      if (extracted.error) {
        return NextResponse.json({ error: extracted.error }, { status: 502 });
      }
      parsedAnyCandidate = true;
      bestHoldings = parseRowsToHoldings(extracted.rows, buildSource).filter(isValidParsedHolding);
      bestTotalRows = extracted.rows.length;
    } else if (isImageUpload) {
      // Screenshot path: read the holdings out of the image with a vision model,
      // then run the exact same row → holding pipeline as a CSV.
      const imageBase64 = typeof payload.fileBase64 === "string" ? payload.fileBase64.trim() : "";
      if (!imageBase64) {
        return NextResponse.json({ error: "Screenshot content is required." }, { status: 400 });
      }
      const imageBuffer = decodeBase64File(imageBase64);
      if (imageBuffer.length === 0) {
        return NextResponse.json({ error: "The screenshot could not be decoded." }, { status: 400 });
      }
      if (imageBuffer.length > MAX_IMPORT_IMAGE_BYTES) {
        return NextResponse.json({ error: "Screenshot is too large. Max 8MB." }, { status: 413 });
      }
      const extracted = await extractHoldingRowsFromImage(imageBase64, getExtension(uploadFileName));
      if (extracted.error) {
        return NextResponse.json({ error: extracted.error }, { status: 502 });
      }
      parsedAnyCandidate = true;
      bestHoldings = parseRowsToHoldings(extracted.rows, buildSource).filter(isValidParsedHolding);
      bestTotalRows = extracted.rows.length;
    } else {
      const normalizedInput = toImportCandidates(payload);
      if (normalizedInput.error) {
        const status = normalizedInput.error.includes("too large") ? 413 : 400;
        return NextResponse.json({ error: normalizedInput.error }, { status });
      }

      for (const candidate of normalizedInput.candidates) {
        const parsed = parseCandidateRows(candidate.text);
        parsedAnyCandidate = parsedAnyCandidate || parsed.parsedAny;

        if (parsed.rows.length === 0) {
          continue;
        }

        const holdings = parseRowsToHoldings(parsed.rows, buildSource).filter(isValidParsedHolding);
        if (holdings.length > bestHoldings.length) {
          bestHoldings = holdings;
          bestTotalRows = parsed.rows.length;
        }
      }
    }

    if (!parsedAnyCandidate) {
      return NextResponse.json({ error: "Unable to parse file data." }, { status: 400 });
    }

    if (bestHoldings.length === 0) {
      const emptyMessage = isDescribe
        ? "I couldn't pick out any holdings from that. Try naming each one and how many units — e.g. \"10 Apple shares, 0.5 Bitcoin, $25k in AustralianSuper\"."
        : isImageUpload
          ? "No holdings could be read from that screenshot. Try a clearer, closer image — or describe them in words instead."
          : "No valid holdings were found in this file.";
      return NextResponse.json({ error: emptyMessage }, { status: 400 });
    }

    const userId = sessionUser?.id || demoGuest?.userId || "";

    let state;
    if (isAuto) {
      // Let the AI decide what each holding is, then save them grouped into the
      // right categories (stocks, crypto, super, funds, …) in one go.
      await classifyHoldingSources(bestHoldings);
      state = saveImportMulti(userId, bestHoldings);
    } else {
      state = saveImport(userId, payload.source as DataSource, bestHoldings);
    }
    const rejectedRows = Math.max(0, bestTotalRows - bestHoldings.length);
    // A short list of what was read in, so the UI can echo "I added: AAPL ×10…"
    // (especially useful for the describe-it-to-the-AI path).
    const importedSummary = bestHoldings.map((holding) => ({
      ticker: holding.ticker,
      name: holding.name,
      units: holding.units,
      source: holding.source,
    }));

    if (!demoGuest) {
      return NextResponse.json({ ...state, rejectedRows, importedSummary });
    }

    // Atomic check-and-increment — returns null if already at the limit
    // (guards against TOCTOU race when concurrent requests slip past the
    // earlier uploadCount check while async file processing is in flight)
    const updatedGuest = incrementDemoGuestUploadCount(demoGuest.userId);
    if (!updatedGuest) {
      return NextResponse.json(
        { error: "Demo upload limit reached. Sign up for a free account to continue.", demoGuest },
        { status: 403 },
      );
    }
    const response = NextResponse.json({
      ...state,
      rejectedRows,
      importedSummary,
      demoGuest: updatedGuest,
    });
    attachDemoGuestCookie(response, updatedGuest.userId, updatedGuest.expiresAt);
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to import report file." }, { status: 500 });
  }
}
