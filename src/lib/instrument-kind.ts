/**
 * Is this ticker a fund, or a company?
 *
 * The look-through panel used to treat every holding it could not read as a
 * fund with a missing file, so BHP sat beside IHVV under "no holdings data —
 * upload its file to see inside". BHP has no holdings file. It is a mining
 * company, and asking someone to upload its portfolio is asking for something
 * that does not exist.
 *
 * The distinction is cheap to establish and was simply never looked up:
 *
 *   1. The SEC fund register answers for US tickers outright — being in
 *      company_tickers_mf.json is what "registered fund" means.
 *   2. The cross-listing map answers for the ASX tickers that are a US fund.
 *   3. Exchange reference data answers for everything else, including the ASX
 *      tickers neither SEC file knows: BHP.AX is EQUITY, IHVV.AX is ETF.
 *   4. The SEC company register is the last resort — a ticker in it with no
 *      fund registration is an operating company.
 *
 * Order matters. A feeder structure is reported as EQUITY by exchange data
 * (VTS.AX comes back EQUITY, being a depositary interest rather than a local
 * fund), so the registers and the map are consulted before it. Getting that
 * backwards would relabel the one kind of fund this engine resolves best.
 *
 * What this is NOT for: deciding whether to attempt resolution. A company can
 * still hold a portfolio worth seeing — Berkshire is EQUITY everywhere and
 * files 44 13Fs — so the resolver still asks. This decides what a holding is
 * CALLED, and whether the UI asks the user for a file that cannot exist.
 */
import { ASX_TO_US_FUND } from "@/lib/fund-crosslist";

export type InstrumentKind = "fund" | "company" | "index" | "unknown";

export interface InstrumentIdentity {
  /** Normalised, suffix stripped. */
  ticker: string;
  kind: InstrumentKind;
  /** The issuer's own name for it, where a source gave one. */
  name: string | null;
  exchange: string | null;
  /** Which source decided, so a wrong answer can be traced to its origin. */
  basis: string;
}

export interface ClassifyOptions {
  market?: "asx" | "us";
  /** False to answer only from cache — for paths that must not block. */
  allowNetwork?: boolean;
}

const YAHOO_CHART = "https://query2.finance.yahoo.com/v8/finance/chart";
const LOOKUP_TIMEOUT_MS = 8000;

/*
 * The store is reached lazily rather than imported.
 *
 * db.ts opens SQLite the moment it loads, which is right for a server route and
 * wrong for a test that only wants to check how a ticker is classified. Loading
 * it on first use keeps this module importable on its own, and a store that
 * cannot be opened degrades to "no cache" rather than to a failed request.
 */
interface KindStore {
  read(ticker: string): { ticker: string; kind: string; name: string; exchange: string; basis: string } | null;
  write(entry: { ticker: string; kind: string; name: string; exchange: string; basis: string }): void;
}

let store: KindStore | null | undefined;

async function kindStore(): Promise<KindStore | null> {
  if (store !== undefined) return store;
  try {
    const db = await import("@/lib/db");
    store = { read: db.readInstrumentKind, write: db.writeInstrumentKind };
  } catch {
    store = null;
  }
  return store;
}

function normalise(ticker: string): string {
  return String(ticker ?? "").trim().toUpperCase().replace(/\.(AX|AU)$/i, "");
}

/**
 * What to ask the exchange about.
 *
 * Australian holdings arrive as bare codes, and a bare code is ambiguous — IVV
 * is an ASX ticker and a US one. The suffix is therefore supplied from the
 * market we already know rather than guessed, and only a holding of unknown
 * market pays for a second attempt.
 */
function candidates(ticker: string, market?: "asx" | "us"): string[] {
  const symbol = normalise(ticker);
  if (!symbol) return [];
  // SEC and Yahoo write class shares differently: BRK.B is BRK-B there.
  const hyphenated = symbol.replace(/\./g, "-");
  if (market === "asx") return [`${symbol}.AX`];
  if (market === "us") return [...new Set([symbol, hyphenated])];
  return [...new Set([symbol, hyphenated, `${symbol}.AX`])];
}

/** Yahoo's instrumentType, which is the exchange's own classification. */
function kindFromInstrumentType(raw: string): InstrumentKind {
  switch (String(raw ?? "").trim().toUpperCase()) {
    case "EQUITY": return "company";
    case "ETF":
    case "MUTUALFUND": return "fund";
    case "INDEX": return "index";
    // CURRENCY, CRYPTOCURRENCY, FUTURE and the rest are neither, and saying so
    // beats forcing them into a box.
    default: return "unknown";
  }
}

interface ExchangeRecord {
  kind: InstrumentKind;
  name: string | null;
  exchange: string | null;
}

async function exchangeLookup(symbol: string): Promise<ExchangeRecord | null> {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          instrumentType?: string;
          exchangeName?: string;
          longName?: string;
          shortName?: string;
        };
      }>;
    };
  };

  const meta = body?.chart?.result?.[0]?.meta;
  if (!meta?.instrumentType) return null;

  return {
    kind: kindFromInstrumentType(meta.instrumentType),
    name: String(meta.longName || meta.shortName || "").trim() || null,
    exchange: String(meta.exchangeName || "").trim() || null,
  };
}

/**
 * What a ticker is.
 *
 * Never throws and never blocks for long: an unanswerable ticker is "unknown",
 * which the callers treat as "might be a fund" — the safe direction, since it
 * leaves the option to upload a file rather than withdrawing it.
 */
export async function classifyInstrument(
  ticker: string,
  options: ClassifyOptions = {},
): Promise<InstrumentIdentity> {
  const symbol = normalise(ticker);
  const unknown: InstrumentIdentity = {
    ticker: symbol, kind: "unknown", name: null, exchange: null, basis: "not established",
  };
  if (!symbol) return unknown;

  const cached = await cachedInstrumentKind(symbol);
  if (cached) return cached;

  const isAsx = options.market === "asx" || /\.(AX|AU)$/i.test(String(ticker));

  // A cross-listing or feeder is a fund however the exchange labels the line.
  if (ASX_TO_US_FUND[symbol]) {
    const identity: InstrumentIdentity = {
      ticker: symbol,
      kind: "fund",
      name: null,
      exchange: isAsx ? "ASX" : null,
      basis: `cross-listing of ${ASX_TO_US_FUND[symbol]}`,
    };
    await remember(identity);
    return identity;
  }

  /*
   * The SEC registers are only consulted for US tickers. An ASX code and a US
   * ticker share a namespace by accident — the resolver has always refused to
   * read the SEC maps for Australian holdings for that reason, and a classifier
   * that did would announce an Australian miner as a Delaware mutual fund.
   */
  if (!isAsx && options.allowNetwork !== false) {
    const registered = await import("@/lib/fund-sec")
      .then((m) => m.isRegisteredFund(symbol))
      .catch(() => false);
    if (registered) {
      const identity: InstrumentIdentity = {
        ticker: symbol, kind: "fund", name: null, exchange: null,
        basis: "SEC fund register (N-PORT filer)",
      };
      await remember(identity);
      return identity;
    }
  }

  if (options.allowNetwork === false) return unknown;

  for (const candidate of candidates(ticker, options.market ?? (isAsx ? "asx" : undefined))) {
    const record = await exchangeLookup(candidate).catch(() => null);
    if (!record || record.kind === "unknown") continue;
    const identity: InstrumentIdentity = {
      ticker: symbol,
      kind: record.kind,
      name: record.name,
      exchange: record.exchange,
      basis: `exchange reference data (${candidate})`,
    };
    await remember(identity);
    return identity;
  }

  // Nothing quoted anywhere answered. The SEC company register still might,
  // and a ticker in it that is not a registered fund is an operating company.
  if (!isAsx) {
    const cik = await import("@/lib/fund-13f")
      .then((m) => m.loadCompanyTickerMap())
      .then((map) => map.get(symbol) ?? map.get(symbol.replace(/\./g, "-")) ?? null)
      .catch(() => null);
    if (cik) {
      const identity: InstrumentIdentity = {
        ticker: symbol, kind: "company", name: null, exchange: null,
        basis: "SEC company register, absent from the fund register",
      };
      await remember(identity);
      return identity;
    }
  }

  /*
   * Not cached. A ticker nobody could identify is usually a transient failure
   * — a timed-out lookup, a rate limit — and storing "unknown" would make one
   * bad minute look like a permanent fact about the holding.
   */
  return unknown;
}

async function remember(identity: InstrumentIdentity): Promise<void> {
  try {
    const cache = await kindStore();
    if (!cache) return;
    cache.write({
      ticker: identity.ticker,
      kind: identity.kind,
      name: identity.name ?? "",
      exchange: identity.exchange ?? "",
      basis: identity.basis,
    });
  } catch {
    // A classification is a convenience, not the answer to the request.
  }
}

/** The cached answer alone, for paths that must not touch the network. */
export async function cachedInstrumentKind(ticker: string): Promise<InstrumentIdentity | null> {
  const symbol = normalise(ticker);
  if (!symbol) return null;

  const cache = await kindStore();
  const row = cache ? cache.read(symbol) : null;
  if (!row?.kind) return null;

  return {
    ticker: symbol,
    kind: row.kind as InstrumentKind,
    name: row.name || null,
    exchange: row.exchange || null,
    basis: row.basis,
  };
}

/** How to describe a holding that could not be looked through. */
export function unresolvedReason(kind: InstrumentKind): string {
  switch (kind) {
    case "company":
      return "Ordinary shares — you own this company directly, so there is nothing inside it to look through.";
    case "index":
      return "An index, not a holding with constituents you own.";
    case "fund":
      return "A fund whose holdings file we cannot read yet. Upload it, or use Fetch where the issuer "
        + "publishes a page we can read.";
    default:
      return "Not identified yet. If this is a fund, upload its holdings file to see inside it.";
  }
}
