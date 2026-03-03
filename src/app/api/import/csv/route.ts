import Papa from "papaparse";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { saveImport } from "@/lib/db";
import { CsvRow, DataSource, extractCsvDataSection, parseRowsToHoldings, PortfolioHolding } from "@/lib/portfolio";

export const runtime = "nodejs";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_HOLDINGS = 10000;

interface ImportCsvPayload {
  source?: unknown;
  csvText?: unknown;
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

export async function POST(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: "Import file is too large. Max 2MB payload." }, { status: 413 });
    }

    const rawBody = await request.text();
    const bodyBytes = new TextEncoder().encode(rawBody).length;
    if (bodyBytes > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: "Import file is too large. Max 2MB payload." }, { status: 413 });
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

    const csvText = typeof payload.csvText === "string" ? payload.csvText : "";
    if (csvText.trim().length === 0) {
      return NextResponse.json({ error: "CSV content is required." }, { status: 400 });
    }

    const normalizedCsv = extractCsvDataSection(csvText);
    const parsed = Papa.parse<CsvRow>(normalizedCsv, {
      header: true,
      skipEmptyLines: true,
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
    return NextResponse.json({ error: "Failed to import CSV report." }, { status: 500 });
  }
}
