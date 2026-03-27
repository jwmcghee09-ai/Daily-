import crypto from "node:crypto";

function getBearerToken(request: Request): string {
  const auth = request.headers.get("authorization") || "";

  if (!auth.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return auth.slice(7).trim();
}

function getHeaderToken(request: Request): string {
  const direct = request.headers.get("x-backup-cron-token") || request.headers.get("x-cron-token") || "";
  return direct.trim();
}

function getQueryToken(request: Request): string {
  try {
    const url = new URL(request.url);
    return (
      url.searchParams.get("backup_cron_token") ||
      url.searchParams.get("cron_token") ||
      url.searchParams.get("token") ||
      ""
    ).trim();
  } catch {
    return "";
  }
}

function normalizeToken(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return "";
  }

  // Tolerate shell/copy mistakes: stray quotes (including smart quotes) and whitespace.
  const withoutEdgeQuotes = trimmed.replace(/^['"`“”‘’]+|['"`“”‘’]+$/g, "");
  const withoutWhitespace = withoutEdgeQuotes.replace(/\s+/g, "");
  return withoutWhitespace;
}

function timingSafeStringEquals(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBytes, bBytes);
}

export function assertCronTokenAuthorized(request: Request): { ok: true } {
  const expected = normalizeToken(process.env.BACKUP_CRON_TOKEN || "");

  if (expected.length === 0) {
    throw new Error("BACKUP_CRON_TOKEN is not configured.");
  }

  const presented = normalizeToken(getBearerToken(request) || getHeaderToken(request) || getQueryToken(request));

  if (!presented || !timingSafeStringEquals(presented, expected)) {
    const error = new Error("Unauthorized");
    error.name = "UnauthorizedError";
    throw error;
  }

  return { ok: true };
}
