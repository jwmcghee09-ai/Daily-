/**
 * Who issues this fund, and where they publish its holdings.
 *
 * This is the safe half of "can it search for the fund details?". When nothing
 * could resolve a fund automatically, a general assistant would be tempted to
 * search the web and read holdings off whatever page came back — which, for a
 * risk tool, is how a confident and completely fictional portfolio gets into
 * someone's numbers. This never does that. It returns IDENTITY only: the issuer
 * behind a fund's name and the page where that issuer publishes the real file,
 * so the instruction becomes "download STW's holdings from State Street and
 * upload it" instead of a bare "upload a file". The holdings themselves still
 * come only from a source the engine can parse and date.
 *
 * Matched on the fund's own name, which the classifier already resolves from
 * the exchange, because an issuer's name is in its funds' names far more
 * reliably than any ticker scheme. Ordered specific-first so "iShares" is read
 * before a generic word it might contain.
 */

export interface IssuerInfo {
  /** The issuer, as a person would say it. */
  issuer: string;
  /** Where this issuer publishes holdings — a page, not a file to parse. */
  holdingsUrl: string;
  /** A ready instruction naming the issuer and where to get the file. */
  guidance: string;
}

interface IssuerRule {
  issuer: string;
  /** Matches the fund's name (and, rarely, its ticker). */
  pattern: RegExp;
  holdingsUrl: string;
}

/*
 * The Australian issuers a visitor is most likely to hold. Each URL is the
 * issuer's own holdings/fund-finder page, not a scraped file — the point is to
 * send the user to the authoritative source, which they can download in a click
 * even where the issuer's site blocks an automated fetch (most of them do, which
 * is the whole reason the upload path exists).
 */
const ISSUER_RULES: readonly IssuerRule[] = [
  { issuer: "BetaShares", pattern: /betashares/i, holdingsUrl: "https://www.betashares.com.au/fund" },
  { issuer: "Vanguard Australia", pattern: /vanguard/i, holdingsUrl: "https://www.vanguard.com.au/personal/invest-with-us/etf" },
  { issuer: "iShares (BlackRock)", pattern: /ishares|blackrock/i, holdingsUrl: "https://www.blackrock.com/au/individual/products/investment-funds" },
  { issuer: "VanEck Australia", pattern: /vaneck/i, holdingsUrl: "https://www.vaneck.com.au/etf/" },
  { issuer: "State Street SPDR", pattern: /spdr|state\s*street|ssga/i, holdingsUrl: "https://www.ssga.com/au/en_gb/intermediary/etfs/fund-finder" },
  { issuer: "Global X Australia", pattern: /global\s*x|etf\s*securities/i, holdingsUrl: "https://www.globalxetfs.com.au/funds/" },
  { issuer: "Fidelity Australia", pattern: /fidelity/i, holdingsUrl: "https://www.fidelity.com.au/funds/" },
  { issuer: "Magellan", pattern: /magellan/i, holdingsUrl: "https://www.magellangroup.com.au/funds/" },
  { issuer: "Dimensional", pattern: /dimensional|\bDFA\b/i, holdingsUrl: "https://www.dimensional.com/au-en/funds" },
  { issuer: "Platinum", pattern: /platinum\s+(asset|international|asia|global|capital)/i, holdingsUrl: "https://www.platinum.com.au/our-products" },
  { issuer: "Antipodes", pattern: /antipodes/i, holdingsUrl: "https://www.antipodes.com/invest/" },
  { issuer: "Pinnacle / Hyperion", pattern: /hyperion/i, holdingsUrl: "https://www.hyperion.com.au/funds/" },
  { issuer: "Perpetual", pattern: /perpetual/i, holdingsUrl: "https://www.perpetual.com.au/" },
];

/**
 * Identify the issuer behind a fund's name, or null if none is recognised.
 *
 * Deliberately returns nothing rather than guess: an unrecognised fund keeps
 * the generic "upload its holdings file" instruction, which is always correct,
 * where a wrong issuer would send the user to the wrong website.
 */
export function detectIssuer(fundName: string | null | undefined, ticker?: string | null): IssuerInfo | null {
  const haystack = `${String(fundName ?? "")} ${String(ticker ?? "")}`.trim();
  if (!haystack) return null;

  for (const rule of ISSUER_RULES) {
    if (rule.pattern.test(haystack)) {
      const label = String(ticker ?? "").trim().toUpperCase().replace(/\.(AX|AU)$/i, "");
      const what = label ? `${label}'s holdings` : "this fund's holdings";
      return {
        issuer: rule.issuer,
        holdingsUrl: rule.holdingsUrl,
        // Worded to avoid "a/an" in front of an issuer name, which misfires on
        // "iShares" and "Antipodes".
        guidance:
          `This fund is issued by ${rule.issuer}. Download ${what} from their site `
          + `(${rule.holdingsUrl}) and upload the file here to see the companies inside it.`,
      };
    }
  }
  return null;
}
