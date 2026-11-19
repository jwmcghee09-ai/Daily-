import Papa from "papaparse";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { countUserHoldings, readUserEntitlements, saveImport } from "@/lib/db";
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
- "costBase": cost base / purchase cost if shown, as a number.
- "account": the account, platform, or wallet name if shown.
Numbers must be plain — no currency symbols, thousands separators, or % signs. Skip totals, subtotals, cash lines, and summary rows. If the image shows no holdings, return {"holdings": []}.`;

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
  return { rows: coerceJsonRows(parsed), error: null };
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

    if (!isValidSource(payload.source)) {
      return NextResponse.json({ error: "Invalid source. Must be 'super', 'asx', 'us', 'gold', 'index', 'fund', 'crypto', 'tax', or 'savings'." }, { status: 400 });
    }

    let bestHoldings: PortfolioHolding[] = [];
    let bestTotalRows = 0;
    let parsedAnyCandidate = false;

    const uploadFileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
    const isImageUpload = IMAGE_UPLOAD_EXTENSIONS.has(getExtension(uploadFileName));

    if (isImageUpload) {
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
      bestHoldings = parseRowsToHoldings(extracted.rows, payload.source).filter(isValidParsedHolding);
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

        const holdings = parseRowsToHoldings(parsed.rows, payload.source).filter(isValidParsedHolding);
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
      return NextResponse.json(
        { error: isImageUpload ? "No holdings could be read from that screenshot. Try a clearer, closer image." : "No valid holdings were found in this file." },
        { status: 400 },
      );
    }

    const userId = sessionUser?.id || demoGuest?.userId || "";
    const state = saveImport(userId, payload.source, bestHoldings);
    const rejectedRows = Math.max(0, bestTotalRows - bestHoldings.length);

    if (!demoGuest) {
      return NextResponse.json({ ...state, rejectedRows });
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
      demoGuest: updatedGuest,
    });
    attachDemoGuestCookie(response, updatedGuest.userId, updatedGuest.expiresAt);
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to import report file." }, { status: 500 });
  }
}
