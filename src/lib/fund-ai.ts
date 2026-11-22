/**
 * AI fallback for fund look-through.
 *
 * When no structured source (SEC N-PORT, a 13F, Betashares, FMP, an uploaded
 * file) can say what a fund holds — which is the normal case for an unlisted
 * Australian managed fund or a super option — a model estimates the composition
 * from the fund's name and well-known strategy, so "see inside your funds" shows
 * something instead of an opaque lump.
 *
 * The result is ALWAYS an approximation and is labelled as such (coverageNote +
 * the "ai" route), never presented as official holdings.
 */
import type { FundComposition, FundConstituent } from "@/lib/lookthrough";
import { normaliseTicker } from "@/lib/lookthrough";

export const AI_FUND_DISCLAIMER =
  "Estimated by AI from the fund's known strategy and published holdings — not official, current holdings. "
  + "Check the fund's latest factsheet or PDS before relying on it.";

const AI_FUND_PROMPT =
  `You are a fund-research analyst. Given a managed fund, ETF or super option by NAME (and maybe a code), return your best estimate of what an investor owns inside it.
Return ONLY JSON: {"recognised": boolean, "asOfYear": number|null, "constituents": [{"name": string, "weightPct": number, "assetClass": string|null, "sector": string|null, "country": string|null, "ticker": string|null}]}.
Rules:
- If you do not recognise the fund, or cannot give a reasonable breakdown, return {"recognised": false, "constituents": []}. NEVER invent a fund you don't know.
- For a DIVERSIFIED / multi-asset fund (e.g. "Vanguard High Growth Index", "AustralianSuper Balanced"), break it down by ASSET CLASS and REGION — e.g. "Australian shares", "International shares", "Global bonds", "Cash" — each with an approximate weightPct and an assetClass, because it holds thousands of underlying securities.
- For a CONCENTRATED equity fund (e.g. "Magellan Global Fund"), list its typical TOP HOLDINGS (companies) with an approximate weightPct, a ticker where well known, sector and country (ISO alpha-2).
- weightPct are percentages that should sum to roughly 100 (they need not be exact).
- "name" is required for every row; set other fields to null when unknown.
Everything is APPROXIMATE and may be out of date.`;

interface RawConstituent {
  name?: unknown;
  weightPct?: unknown;
  assetClass?: unknown;
  sector?: unknown;
  country?: unknown;
  ticker?: unknown;
}

/**
 * Estimate a fund's composition from its name. Returns null when AI isn't
 * configured, the fund isn't recognised, or nothing usable comes back. Never
 * throws — an unresolved fund is a normal outcome.
 */
export async function fetchAiComposition(ticker: string, name: string): Promise<FundComposition | null> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;

  const fundName = String(name || "").trim();
  // Need a real name to research; a bare ticker or code isn't enough to trust.
  if (fundName.length < 4) return null;

  const base = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = String(process.env.OPENAI_FUND_MODEL || "gpt-4o").trim();

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
          { role: "system", content: AI_FUND_PROMPT },
          { role: "user", content: `Fund name: ${fundName}${ticker ? `\nCode: ${ticker}` : ""}` },
        ],
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let content = "";
  try {
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    content = data.choices?.[0]?.message?.content ?? "";
  } catch {
    return null;
  }

  let parsed: { recognised?: unknown; asOfYear?: unknown; constituents?: unknown };
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || parsed.recognised === false || !Array.isArray(parsed.constituents)) return null;

  const constituents: FundConstituent[] = (parsed.constituents as RawConstituent[])
    .map((raw): FundConstituent | null => {
      const nm = String(raw?.name ?? "").trim();
      const w = Number(raw?.weightPct);
      if (!nm || !Number.isFinite(w) || w <= 0) return null;
      const tk = raw?.ticker ? normaliseTicker(String(raw.ticker)) : "";
      const country = raw?.country ? String(raw.country).toUpperCase().slice(0, 2) : undefined;
      return {
        name: nm,
        weightPct: Math.min(100, w),
        ticker: tk || undefined,
        sector: raw?.sector ? String(raw.sector) : undefined,
        country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
        assetClass: raw?.assetClass ? String(raw.assetClass) : undefined,
      };
    })
    .filter((c): c is FundConstituent => c !== null);

  if (constituents.length === 0) return null;

  const year = Number(parsed.asOfYear);
  const asOf = Number.isFinite(year) && year > 2000 && year <= new Date().getFullYear()
    ? `${year}-01-01`
    : new Date().toISOString().slice(0, 10);

  return {
    fundTicker: normaliseTicker(ticker) || ticker,
    fundName,
    constituents,
    source: "AI estimate",
    asOf,
    // The breakdown stands for the whole fund (asset-class level), but it is an
    // estimate — the coverage note, not the percentage, carries that caveat.
    coveragePct: 100,
    coverageNote: AI_FUND_DISCLAIMER,
  };
}
