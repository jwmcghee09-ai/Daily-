/**
 * Upload a fund's holdings file.
 *
 * The route that makes look-through work outside the US. Australian super funds
 * have published portfolio holdings as a downloadable CSV since March 2022, and
 * ASX issuers publish constituent files — but their sites answer automated
 * requests with 403s and move their URLs, so SPECTRE cannot fetch them. A
 * signed-in person can download the file in one click.
 *
 * Accepting that file directly is both more robust than a scraper and more
 * honest: the data is the issuer's own, dated by the issuer, and the user can
 * see exactly what went in.
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { guardDemoGuest, resolvePortfolioActor } from "@/lib/portfolio-actor";
import { deleteFundComposition, listFundCompositions, writeFundComposition } from "@/lib/db";
import { parseHoldingsRows } from "@/lib/fund-holdings";
import { normaliseTicker } from "@/lib/lookthrough";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(["csv", "txt", "tsv", "psv"]);
const WORKBOOK_EXTENSIONS = new Set(["xlsx", "xls", "xlsm", "xlsb", "ods"]);

/** Every row of every sheet, as strings — the shape parseHoldingsRows wants. */
function toRows(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  return (parsed.data ?? []).filter(Array.isArray);
}

function workbookToRows(buffer: Buffer): string[][] {
  const workbook = XLSX.read(buffer, { type: "buffer", dense: true });
  let best: string[][] = [];
  // A super fund's workbook carries a sheet per investment option; the largest
  // is the one worth reading, and the user names the option in `label`.
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = toRows(XLSX.utils.sheet_to_csv(sheet, { blankrows: false }));
    if (rows.length > best.length) best = rows;
  }
  return best;
}

export async function GET(request: Request) {
  const actor = await resolvePortfolioActor(request);
  if (!actor) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  return NextResponse.json({ compositions: listFundCompositions(actor.userId) });
}

export async function POST(request: Request) {
  const actor = await resolvePortfolioActor(request);
  if (!actor) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  /*
   * Separate from the demo's two-file portfolio import cap, deliberately: a
   * holdings file is what makes look-through work for an Australian fund, and
   * spending the portfolio budget on it would mean a visitor could demonstrate
   * one feature or the other but not both. Parsing a workbook is local work, so
   * the budget is generous.
   */
  const limited = guardDemoGuest(request, actor, "fundupload", 6, 5 * 60_000);
  if (limited) return limited;

  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Holdings file is too large. Max 8MB." }, { status: 413 });
  }

  let payload: { ticker?: unknown; label?: unknown; asOf?: unknown; csvText?: unknown; fileBase64?: unknown; fileName?: unknown };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Holdings file is too large. Max 8MB." }, { status: 413 });
    }
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const ticker = normaliseTicker(String(payload.ticker ?? ""));
  if (!ticker || ticker.length > 32) {
    return NextResponse.json(
      { error: "Which holding is this for? Give the ticker or code as it appears in your portfolio." },
      { status: 400 },
    );
  }

  let rows: string[][] = [];
  try {
    if (typeof payload.fileBase64 === "string" && payload.fileBase64.trim()) {
      const name = String(payload.fileName ?? "").toLowerCase();
      const ext = name.includes(".") ? name.split(".").pop()! : "csv";
      const buffer = Buffer.from(payload.fileBase64, "base64");
      if (buffer.length === 0) {
        return NextResponse.json({ error: "That file appears to be empty." }, { status: 400 });
      }
      if (WORKBOOK_EXTENSIONS.has(ext)) rows = workbookToRows(buffer);
      else if (TEXT_EXTENSIONS.has(ext) || !name) rows = toRows(buffer.toString("utf8"));
      else {
        return NextResponse.json(
          { error: `Cannot read a ${ext.toUpperCase()} file. Please upload CSV, TSV, TXT, XLSX, XLS or ODS.` },
          { status: 400 },
        );
      }
    } else if (typeof payload.csvText === "string" && payload.csvText.trim()) {
      rows = toRows(payload.csvText);
    } else {
      return NextResponse.json({ error: "No holdings file was provided." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "That file could not be read." }, { status: 400 });
  }

  const parsed = parseHoldingsRows(rows);
  if (parsed.constituents.length === 0) {
    return NextResponse.json(
      {
        error: "No holdings were found in that file. It needs a header row with a name column and "
          + "either a weight or a dollar value column.",
        rowsSeen: rows.length,
      },
      { status: 422 },
    );
  }

  const asOf = typeof payload.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.asOf)
    ? payload.asOf
    : new Date().toISOString().slice(0, 10);

  writeFundComposition({
    ticker,
    fundName: String(payload.label ?? "").slice(0, 120),
    route: "uploaded",
    source: "Uploaded holdings file",
    asOf,
    constituents: parsed.constituents,
    userId: actor.userId,
  });

  return NextResponse.json({
    ok: true,
    ticker,
    constituents: parsed.constituents.length,
    skipped: parsed.rowsSkipped,
    asOf,
    weightBasis: parsed.weightBasis,
    note: parsed.weightBasis === "derived-from-value"
      // Worth saying plainly: if the file lists only the top holdings, deriving
      // weights from its own total scales them up to 100% and overstates each.
      ? "This file reported dollar values but no weights, so weights were derived from its total. If it lists only the largest holdings, those weights will read high."
      : "Weights were taken from the file as reported.",
  });
}

export async function DELETE(request: Request) {
  const actor = await resolvePortfolioActor(request);
  if (!actor) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const ticker = normaliseTicker(new URL(request.url).searchParams.get("ticker") ?? "");
  if (!ticker) return NextResponse.json({ error: "Which ticker?" }, { status: 400 });

  const removed = deleteFundComposition(ticker, actor.userId);
  return NextResponse.json({ ok: true, removed });
}
