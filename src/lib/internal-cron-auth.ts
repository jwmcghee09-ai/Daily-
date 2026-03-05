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

function timingSafeStringEquals(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBytes, bBytes);
}

export function assertCronTokenAuthorized(request: Request): { ok: true } {
  const expected = String(process.env.BACKUP_CRON_TOKEN || "").trim();

  if (expected.length < 24) {
    throw new Error("BACKUP_CRON_TOKEN is not configured.");
  }

  const presented = getBearerToken(request) || getHeaderToken(request);

  if (!presented || !timingSafeStringEquals(presented, expected)) {
    const error = new Error("Unauthorized");
    error.name = "UnauthorizedError";
    throw error;
  }

  return { ok: true };
}
