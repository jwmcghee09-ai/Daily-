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
 * Supports both common inbound providers, because they differ in two ways:
 *  - Mailgun posts multipart form fields and signs each request (HMAC over
 *    timestamp + token).
 *  - Postmark posts JSON and does NOT sign; it authenticates by letting you put
 *    HTTP Basic credentials in the webhook URL.
 * Whichever is configured, a request that proves neither is rejected.
 *
 * Threat model: this endpoint is reachable by anyone who can send email, so
 * nothing it receives is trusted. The alias identifying the account is random
 * and rotatable, an unknown alias is discarded without acknowledgement, and
 * parsed trades are stored as PENDING — nothing reaches a portfolio until the
 * user reviews it, so a forged email cannot silently alter holdings.
 */

const MAX_BODY_BYTES = 512 * 1024;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Mailgun: HMAC over timestamp + token, with a window against replays. */
function verifyMailgunSignature(fields: Record<string, string>, signingKey: string): boolean {
  const { timestamp = "", token = "", signature = "" } = fields;
  if (!timestamp || !token || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = crypto.createHmac("sha256", signingKey).update(timestamp + token).digest("hex");
  return safeEqual(expected, signature);
}

/** Postmark: HTTP Basic credentials carried in the webhook URL. */
function verifyBasicAuth(header: string | null, expected: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const supplied = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  return safeEqual(supplied, expected);
}

/** Normalise either provider's payload into one flat shape. */
interface InboundEmail {
  recipients: string[];
  from: string;
  subject: string;
  text: string;
  html: string;
}

function fromMailgun(fields: Record<string, string>): InboundEmail {
  return {
    recipients: [fields.recipient, fields.to, fields.To, fields["envelope-to"]].filter(Boolean) as string[],
    from: String(fields.from ?? fields.sender ?? fields.From ?? ""),
    subject: String(fields.subject ?? fields.Subject ?? ""),
    text: String(fields["body-plain"] ?? fields["stripped-text"] ?? fields.text ?? ""),
    html: String(fields["body-html"] ?? fields["stripped-html"] ?? fields.html ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromPostmark(payload: any): InboundEmail {
  const toFull: string[] = Array.isArray(payload?.ToFull)
    ? payload.ToFull.map((entry: { Email?: string }) => entry?.Email).filter(Boolean)
    : [];
  return {
    recipients: [payload?.OriginalRecipient, payload?.To, ...toFull].filter(Boolean),
    from: String(payload?.From ?? payload?.FromFull?.Email ?? ""),
    subject: String(payload?.Subject ?? ""),
    text: String(payload?.TextBody ?? payload?.StrippedTextReply ?? ""),
    html: String(payload?.HtmlBody ?? ""),
  };
}

/** Find the alias token in whichever recipient field carried it. */
function extractToken(recipients: string[]): string | null {
  for (const candidate of recipients) {
    for (const match of String(candidate).matchAll(/([a-z0-9]{8,40})@/gi)) {
      const token = match[1].toLowerCase();
      if (findUserIdByIngestToken(token)) return token;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const signingKey = String(process.env.INBOUND_EMAIL_SIGNING_KEY || "").trim();
  const basicAuth = String(process.env.INBOUND_EMAIL_BASIC_AUTH || "").trim();
  if (!signingKey && !basicAuth) {
    return NextResponse.json({ error: "Inbound email is not configured." }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let email: InboundEmail;
  let authed = false;

  if (contentType.includes("application/json")) {
    // Postmark. There is no signature to check, so Basic auth must be set up.
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Unreadable payload." }, { status: 400 });
    }
    authed = Boolean(basicAuth) && verifyBasicAuth(request.headers.get("authorization"), basicAuth);
    email = fromPostmark(payload);
  } else {
    // Mailgun (multipart or urlencoded).
    const fields: Record<string, string> = {};
    try {
      const form = await request.formData();
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") fields[key] = value;
      }
    } catch {
      return NextResponse.json({ error: "Unreadable payload." }, { status: 400 });
    }
    authed =
      (Boolean(signingKey) && verifyMailgunSignature(fields, signingKey)) ||
      (Boolean(basicAuth) && verifyBasicAuth(request.headers.get("authorization"), basicAuth));
    email = fromMailgun(fields);
  }

  if (!authed) {
    // Deliberately terse: never reveal which check failed.
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const token = extractToken(email.recipients);
  const userId = token ? findUserIdByIngestToken(token) : null;
  if (!userId) {
    // Accepted so the provider stops retrying, but nothing is stored — there is
    // no account to attribute it to.
    return NextResponse.json({ ok: true, ignored: "unknown recipient" });
  }

  const subject = email.subject.slice(0, 500);
  const from = email.from.slice(0, 320);
  const body = (email.text.trim() ? email.text : htmlToText(email.html)).slice(0, 200_000);

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
