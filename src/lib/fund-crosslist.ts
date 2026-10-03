/**
 * ASX tickers that ARE a US registered fund, not merely similar to one.
 *
 * The test for an entry here is whether the two tickers give you a claim on the
 * same portfolio. "Tracks the same index" is not the same thing and does not
 * qualify: NDQ is not QQQ, and mapping it would put holdings in the book that
 * the user does not own.
 *
 * Two structures pass that test. A CDI is the US fund quoted on the ASX. A
 * feeder is an Australian-domiciled fund whose only real asset is units in the
 * US fund — BlackRock converted its ASX range to feeders in late 2018, and the
 * conversion did not change what sits underneath. Both mean the same 500
 * companies, so looking through to the US filing is reading the user's actual
 * holdings, not an approximation of them.
 *
 * Every entry carries the evidence for it, because the failure mode is silent:
 * a wrong mapping produces a confident, detailed, completely fictional
 * portfolio. Two entries were removed for exactly that reason — see below.
 *
 * This lives in its own module so the classifier and the resolver can both read
 * it without importing each other.
 */
export const ASX_TO_US_FUND: Readonly<Record<string, string>> = {
  // Feeder since the 2018 restructure: holds iShares Core S&P 500 ETF (IVV) at
  // 99.95% of net assets.
  IVV: "IVV",
  // CDI over the US fund.
  VTS: "VTI",
  VEU: "VEU",
  // Same 2018 restructure as IVV, same family, same index, same ticker.
  IJH: "IJH",
  IJR: "IJR",
  // AUD-hedged feeder: its largest holding is the US iShares Core S&P 500 ETF
  // at 99.40%, with the rest in AUD/USD forwards. The equities underneath are
  // therefore IVV's exactly; the currency hedge is not represented in a
  // look-through and is called out as such where it is shown.
  IHVV: "IVV",
  // ASX IEM tracks the MSCI Emerging Markets Index, which is EEM's index.
  // It was previously mapped to IEMG — a different fund tracking MSCI EM IMI,
  // which adds small caps and roughly 1,300 extra constituents.
  IEM: "EEM",

  /*
   * Deliberately absent, having once been here:
   *
   * IWLD -> URTH. IWLD is Australian-domiciled, holds its 635 constituents
   *   physically, and tracks the MSCI World ex Australia Custom ESG Leaders
   *   Index. URTH tracks MSCI World: no ESG screen, Australia included, about
   *   twice the constituents. Not the same portfolio, so IWLD now needs its
   *   holdings file uploaded like any other Australian fund.
   *
   * IHOO -> IOO. The AUD-hedged ticker looked like IHVV's structure and is
   *   not: IHOO replicates physically with 104 holdings of its own rather than
   *   feeding the US fund. The hedged range is not uniform, which is why these
   *   are verified one at a time.
   */
};

/**
 * Feeders that hedge the currency as well as holding the US fund.
 *
 * The equities underneath are the US fund's exactly, so the look-through is
 * right about what companies the money is in. It is silent about the forward
 * contracts that remove the AUD/USD exposure, which are a real position and
 * one this engine cannot see — a hedged and an unhedged holding of the same 500
 * companies behave differently, and a reader comparing them deserves to be
 * told that only the equity half is shown.
 */
export const AUD_HEDGED_FEEDERS: ReadonlySet<string> = new Set(["IHVV"]);

/** Whether this ASX ticker is a cross-listing or feeder of a US fund. */
export function isCrossListedFund(symbol: string): boolean {
  return Boolean(ASX_TO_US_FUND[symbol.trim().toUpperCase().replace(/\.(AX|AU)$/i, "")]);
}
