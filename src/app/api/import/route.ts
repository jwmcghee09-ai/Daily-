import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { saveImport } from "@/lib/db";
import { DataSource, PortfolioHolding } from "@/lib/portfolio";

export const runtime = "nodejs";

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_HOLDINGS = 10000;

interface ImportPayload {
  source?: DataSource;
  holdings?: PortfolioHolding[];
}

function isValidSource(value: unknown): value is DataSource {
  return value === "super" || value === "asx" || value === "gold" || value === "index" || value === "fund";
}

function parseImportPayload(rawBody: string): ImportPayload {
  const parsed = JSON.parse(rawBody) as unknown;

  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  return parsed as ImportPayload;
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

    let payload: ImportPayload;

    try {
      payload = parseImportPayload(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    if (!isValidSource(payload.source)) {
      return NextResponse.json({ error: "Invalid source. Must be 'super', 'asx', 'gold', 'index', or 'fund'." }, { status: 400 });
    }

    if (!Array.isArray(payload.holdings) || payload.holdings.length === 0) {
      return NextResponse.json({ error: "No holdings were provided." }, { status: 400 });
    }

    if (payload.holdings.length > MAX_HOLDINGS) {
      return NextResponse.json({ error: `Too many holdings in one import. Max ${MAX_HOLDINGS} rows.` }, { status: 413 });
    }

    const state = saveImport(sessionUser.id, payload.source, payload.holdings);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Failed to persist imported report." }, { status: 500 });
  }
}
