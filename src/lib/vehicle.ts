/**
 * What kind of thing did we just look through?
 *
 * Look-through resolves a wrapper into the securities inside it, and until now
 * every wrapper was "a fund". That is wrong in the one place it matters most to
 * an Australian investor: their super. For most people super is their largest
 * holding and the most opaque one, and "see inside your super" is a different,
 * stronger promise than "see inside your ETFs" — so the product has to be able
 * to tell the two apart and say which it is.
 *
 * The holding's own import `source` is the authoritative signal, not the filing
 * that answered. A line imported as super is the user's super whether its
 * holdings came from an uploaded disclosure or anywhere else; the resolution
 * `route` only distinguishes the non-super vehicles from each other.
 *
 * This is deliberately a pure function of what is already known — no network,
 * no lookup — so the API, the look-through panel and the MCP tools can all
 * label a vehicle the same way without each inventing its own rule.
 */

/**
 * - `super`        a superannuation balance, looked through to its holdings
 * - `etf`          a listed fund resolved from a filing or issuer file
 * - `managed-fund` an unlisted/managed fund, typically from an uploaded file
 * - `company`      a holding company seen inside via its 13F (Berkshire, LICs)
 * - `share`        an ordinary share the user owns directly, nothing inside it
 * - `unknown`      not yet classified, or nothing that can be looked through
 */
export type Vehicle = "super" | "etf" | "managed-fund" | "company" | "share" | "unknown";

const ETF_ROUTES = new Set(["sec", "cross-listed", "issuer"]);
const LISTED_SOURCES = new Set(["asx", "us", "index"]);

export interface VehicleSignals {
  /** The import the holding came from: "super", "asx", "fund", "us", … */
  source?: string | null;
  /** The resolution route, when the holding was looked through. */
  route?: string | null;
  /** The instrument kind, when the holding was classified but not resolved. */
  kind?: string | null;
}

/**
 * Decide a holding's vehicle from what is already known about it.
 *
 * Order matters: super wins over everything because the user's own import said
 * so, and no filing can override that. After that, a resolved holding is typed
 * by the route that answered, and an unresolved one by its classified kind.
 */
export function classifyVehicle({ source, route, kind }: VehicleSignals): Vehicle {
  const src = String(source ?? "").trim().toLowerCase();
  const rte = String(route ?? "").trim().toLowerCase();
  const knd = String(kind ?? "").trim().toLowerCase();

  // The user told us this is super. Nothing a filing says outranks that.
  if (src === "super") return "super";

  // Resolved: the route that answered says what kind of wrapper it was.
  if (rte === "13f") return "company";
  if (ETF_ROUTES.has(rte)) return "etf";
  if (rte === "uploaded") {
    if (src === "fund") return "managed-fund";
    if (LISTED_SOURCES.has(src)) return "etf";
    return "managed-fund";
  }

  // Unresolved: fall back to how the instrument was classified.
  if (knd === "company") return "share";
  if (knd === "fund") return src === "fund" ? "managed-fund" : "etf";

  return "unknown";
}

/** A human label for the vehicle, for UI and for a connected assistant. */
export function vehicleLabel(vehicle: Vehicle): string {
  switch (vehicle) {
    case "super": return "Superannuation";
    case "etf": return "ETF";
    case "managed-fund": return "Managed fund";
    case "company": return "Holding company";
    case "share": return "Direct share";
    case "unknown": return "Unclassified";
  }
}
