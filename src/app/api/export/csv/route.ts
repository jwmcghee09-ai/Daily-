import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readPortfolioState } from "@/lib/db";
import Papa from "papaparse";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const state = readPortfolioState(user.id);
    const holdings = state.holdings || [];

    if (holdings.length === 0) {
      return NextResponse.json({ error: "No holdings to export" }, { status: 404 });
    }

    // Sanitize cells to prevent CSV injection
    function sanitize(val: unknown): string {
      const str = String(val ?? "");
      if (/^[=+\-@\t\r]/.test(str)) {
        return "'" + str;
      }
      return str;
    }

    // Map holdings to export rows using actual PortfolioHolding field names
    const rows = holdings.map((h) => ({
      Account: sanitize(h.account),
      Ticker: sanitize(h.ticker),
      Name: sanitize(h.name),
      Units: h.units,
      Price: h.price,
      "Prev Close": h.prevClose,
      Value: h.value,
      "Cost Base": h.costBase,
      Sector: sanitize(h.sector),
      "Report Date": sanitize(h.reportDate),
      Source: sanitize(h.source),
    }));

    const csv = Papa.unparse(rows);
    const today = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="spectre-holdings-${today}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to export holdings." }, { status: 500 });
  }
}
