import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  findUserIdByIngestToken,
  hasIngestedBody,
  insertIngestTrades,
  recordIngestMessage,
} from "@/lib/db";
import { htmlToText, parseContractNote } from "@/lib/contract-notes";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Inbound webhook for forwarded broker confirmations.
 *
 * Threat model: this endpoint is reachable by anyone who can send email, so
 * nothing it receives is trusted.
 *  - The request itself must carry a valid provider signature, so only our
 *    mail provider can post here at all.
 *  - The recipient alias identifies the account. It is random, unguessable and
 *    rotatable, and an unknown alias is discarded without revealing anything.
 *  - Parsed trades are stored as PENDING. Nothing reaches a portfolio until
 *    the user reviews and applies it, so a forged email cannot silently alter
 *    someone's holdings.
 */

const MAX_BODY_BYTES = 512 * 1024;

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Mailgun signs each post with timestamp + token + HMAC. Verifying it is what
 * stops anyone from POSTing a fake "email" straight at this endpoint.
 */
function verifyMailgun(fields: Record<string, string>, signingKey: string): boolean {
  const timestamp = fields.timestamp ?? "";
  const token = fields.token ?? "";
  const signature = fields.signature ?? "";
  if (!timestamp || !token || !signature) return false;

  // Reject replays of an old, previously-valid signature.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = crypto.createHmac("sha256", signingKey).update(timestamp + token).digest("hex");
  return timingSafeEqual(expected, signature);
}

/** Pull the alias token out of whichever recipient field the provider sent. */
function extractToken(fields: Record<string, string>): string | null {
  const candidates = [fields.recipient, fields.to, fields.To, fields["envelope-to"]].filter(Boolean);
  for (const candidate of candidates) {
    for (const match of String(candidate).matchAll(/([a-z0-9]{8,40})@/gi)) {
      const token = match[1].toLowerCase();
      if (findUserIdByIngestToken(token)) return token;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const signingKey = String(process.env.INBOUND_EMAIL_SIGNING_KEY || "").trim();
  if (!signingKey) {
    return NextResponse.json({ error: "Inbound email is not configured." }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  // Providers post either multipart/form-data or urlencoded; both arrive as FormData.
  let fields: Record<string, string> = {};
  try {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") fields[key] = value;
    }
  } catch {
    try {
      fields = (await request.json()) as Record<string, string>;
    } catch {
      return NextResponse.json({ error: "Unreadable payload." }, { status: 400 });
    }
  }

  if (!verifyMailgun(fields, signingKey)) {
    // Deliberately terse: never confirm which part failed.
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const token = extractToken(fields);
  if (!token) {
    // Accepted so the provider does not retry, but nothing is stored — we have
    // no account to attribute it to.
    return NextResponse.json({ ok: true, ignored: "unknown recipient" });
  }
  const userId = findUserIdByIngestToken(token);
  if (!userId) return NextResponse.json({ ok: true, ignored: "unknown recipient" });

  const subject = String(fields.subject ?? fields.Subject ?? "").slice(0, 500);
  const from = String(fields.from ?? fields.sender ?? fields.From ?? "").slice(0, 320);
  const plain = String(fields["body-plain"] ?? fields["stripped-text"] ?? fields.text ?? "");
  const html = String(fields["body-html"] ?? fields["stripped-html"] ?? fields.html ?? "");
  const body = (plain.trim() ? plain : htmlToText(html)).slice(0, 200_000);

  const bodyHash = crypto.createHash("sha256").update(`${subject}\n${body}`).digest("hex");
  const messageId = crypto.randomUUID();

  // Forwarding the same confirmation twice must not double-count a trade.
  if (hasIngestedBody(userId, bodyHash)) {
    recordIngestMessage({
      id: messageId, userId, fromAddress: from, subject,
      broker: null, status: "duplicate",
      reason: "This confirmation has already been received.", bodyHash,
    });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const result = parseContractNote(subject, body, from);

  if (!result.trades.length) {
    recordIngestMessage({
      id: messageId, userId, fromAddress: from, subject,
      broker: result.broker, status: "unparsed",
      reason: result.reason ?? "No trade details found.", bodyHash,
    });
    return NextResponse.json({ ok: true, parsed: 0, reason: result.reason });
  }

  recordIngestMessage({
    id: messageId, userId, fromAddress: from, subject,
    broker: result.broker, status: "parsed", reason: "", bodyHash,
  });
  const inserted = insertIngestTrades(messageId, userId, result.trades);

  return NextResponse.json({ ok: true, parsed: inserted, broker: result.broker });
}
