import Papa from "papaparse";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { saveImport } from "@/lib/db";
import { CsvRow, DataSource, extractCsvDataSection, parseRowsToHoldings, PortfolioHolding } from "@/lib/portfolio";

export const runtime = "nodejs";

const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_BODY_BYTES = 4 * 1024 * 1024;
const MAX_HOLDINGS = 10000;
const TEXT_UPLOAD_EXTENSIONS = new Set(["csv", "txt", "tsv"]);
const WORKBOOK_UPLOAD_EXTENSIONS = new Set(["xlsx", "xls", "numbers", "ods"]);
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([...TEXT_UPLOAD_EXTENSIONS, ...WORKBOOK_UPLOAD_EXTENSIONS]);

interface ImportCsvPayload {
  source?: unknown;
  csvText?: unknown;
  fileName?: unknown;
  fileBase64?: unknown;
}

function isValidSource(value: unknown): value is DataSource {
  return value === "super" || value === "asx" || value === "gold" || value === "index" || value === "fund" || value === "crypto";
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

function parseWorkbookToCsv(fileBuffer: Buffer): string {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", dense: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return "";
  }

  const worksheet = workbook.Sheets[firstSheet];
  if (!worksheet) {
    return "";
  }

  return XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
}

function toCsvText(payload: ImportCsvPayload): { csvText: string; error: string | null } {
  const csvText = typeof payload.csvText === "string" ? payload.csvText : "";
  if (csvText.trim().length > 0) {
    return { csvText, error: null };
  }

  const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
  const fileBase64 = typeof payload.fileBase64 === "string" ? payload.fileBase64.trim() : "";
  if (!fileName || !fileBase64) {
    return { csvText: "", error: "CSV content is required." };
  }

  const extension = getExtension(fileName);
  if (!SUPPORTED_UPLOAD_EXTENSIONS.has(extension)) {
    return {
      csvText: "",
      error: "Unsupported file type. Use CSV, TSV, TXT, XLSX, XLS, NUMBERS, or ODS.",
    };
  }

  const fileBuffer = decodeBase64File(fileBase64);
  if (fileBuffer.length === 0) {
    return { csvText: "", error: "Uploaded file could not be decoded." };
  }
  if (fileBuffer.length > MAX_IMPORT_FILE_BYTES) {
    return { csvText: "", error: "Import file is too large. Max 2MB file size." };
  }

  if (WORKBOOK_UPLOAD_EXTENSIONS.has(extension)) {
    let workbookCsv = "";
    try {
      workbookCsv = parseWorkbookToCsv(fileBuffer);
    } catch {
      return { csvText: "", error: "Workbook file could not be parsed." };
    }
    if (workbookCsv.trim().length === 0) {
      return { csvText: "", error: "Workbook file appears empty." };
    }
    return { csvText: workbookCsv, error: null };
  }

  const textValue = fileBuffer.toString("utf8");
  if (textValue.trim().length === 0) {
    return { csvText: "", error: "Text file appears empty." };
  }

  return { csvText: textValue, error: null };
}

export async function POST(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
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
      return NextResponse.json({ error: "Invalid source. Must be 'super', 'asx', 'gold', 'index', 'fund', or 'crypto'." }, { status: 400 });
    }

    const normalizedInput = toCsvText(payload);
    if (normalizedInput.error) {
      const status = normalizedInput.error.includes("too large") ? 413 : 400;
      return NextResponse.json({ error: normalizedInput.error }, { status });
    }

    const normalizedCsv = extractCsvDataSection(normalizedInput.csvText);
    const parsed = Papa.parse<CsvRow>(normalizedCsv, {
      header: true,
      skipEmptyLines: true,
      delimiter: "",
      transformHeader: (header) => header.trim(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return NextResponse.json({ error: "Unable to parse CSV." }, { status: 400 });
    }

    const holdings = parseRowsToHoldings(parsed.data, payload.source).filter(isValidParsedHolding);
    if (holdings.length === 0) {
      return NextResponse.json({ error: "No valid holdings were found in this CSV." }, { status: 400 });
    }

    if (holdings.length > MAX_HOLDINGS) {
      return NextResponse.json({ error: `Too many holdings in one import. Max ${MAX_HOLDINGS} rows.` }, { status: 413 });
    }

    const state = saveImport(sessionUser.id, payload.source, holdings);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Failed to import report file." }, { status: 500 });
  }
}
