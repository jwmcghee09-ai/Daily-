import Papa from "papaparse";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { saveImport } from "@/lib/db";
import {
  attachDemoGuestCookie,
  createDemoGuestContext,
  DEMO_GUEST_MAX_UPLOADS,
  getDemoGuestContext,
  incrementDemoGuestUploadCount,
} from "@/lib/demo-guest";
import { CsvRow, DataSource, extractCsvDataSection, parseRowsToHoldings, PortfolioHolding } from "@/lib/portfolio";

export const runtime = "nodejs";

const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_BODY_BYTES = 4 * 1024 * 1024;
const TEXT_UPLOAD_EXTENSIONS = new Set(["csv", "txt", "tsv", "psv", "json"]);
const WORKBOOK_UPLOAD_EXTENSIONS = new Set(["xlsx", "xls", "xlsm", "xlsb", "numbers", "ods"]);
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([...TEXT_UPLOAD_EXTENSIONS, ...WORKBOOK_UPLOAD_EXTENSIONS]);
const SUPPORTED_UPLOAD_FORMATS_LABEL = "CSV, TSV, PSV, TXT, JSON, XLSX, XLS, XLSM, XLSB, NUMBERS, or ODS";
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
  return value === "super" || value === "asx" || value === "gold" || value === "index" || value === "fund" || value === "crypto" || value === "tax" || value === "savings";
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
      return NextResponse.json({ error: "Invalid source. Must be 'super', 'asx', 'gold', 'index', 'fund', 'crypto', 'tax', or 'savings'." }, { status: 400 });
    }

    const normalizedInput = toImportCandidates(payload);
    if (normalizedInput.error) {
      const status = normalizedInput.error.includes("too large") ? 413 : 400;
      return NextResponse.json({ error: normalizedInput.error }, { status });
    }

    let bestHoldings: PortfolioHolding[] = [];
    let parsedAnyCandidate = false;

    for (const candidate of normalizedInput.candidates) {
      const parsed = parseCandidateRows(candidate.text);
      parsedAnyCandidate = parsedAnyCandidate || parsed.parsedAny;

      if (parsed.rows.length === 0) {
        continue;
      }

      const holdings = parseRowsToHoldings(parsed.rows, payload.source).filter(isValidParsedHolding);
      if (holdings.length > bestHoldings.length) {
        bestHoldings = holdings;
      }
    }

    if (!parsedAnyCandidate) {
      return NextResponse.json({ error: "Unable to parse file data." }, { status: 400 });
    }

    if (bestHoldings.length === 0) {
      return NextResponse.json({ error: "No valid holdings were found in this file." }, { status: 400 });
    }

    const userId = sessionUser?.id || demoGuest?.userId || "";
    const state = saveImport(userId, payload.source, bestHoldings);

    if (!demoGuest) {
      return NextResponse.json(state);
    }

    const updatedGuest = incrementDemoGuestUploadCount(demoGuest.userId);
    const response = NextResponse.json({
      ...state,
      demoGuest: updatedGuest,
    });
    attachDemoGuestCookie(response, updatedGuest.userId, updatedGuest.expiresAt);
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to import report file." }, { status: 500 });
  }
}
