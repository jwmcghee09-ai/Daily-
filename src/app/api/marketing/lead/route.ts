import { NextResponse } from "next/server";
import { isLikelyEmail, normalizeEmail } from "@/lib/auth";
import { isOperationalAlertConfigured, sendOperationalAlertEmail } from "@/lib/mailer";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientAddress } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientAddress(request);
    const rate = consumeRateLimit(`lead:${ip}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
    }

    const body = (await request.json()) as { email?: unknown; consent?: unknown; deal?: unknown };
    const email = normalizeEmail(String(body.email || ""));
    const consent = body.consent === true;
    const deal = typeof body.deal === "string" ? body.deal : "";

    if (!isLikelyEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    }

    if (!consent) {
      return NextResponse.json({ error: "Please accept to continue." }, { status: 400 });
    }

    if (isOperationalAlertConfigured()) {
      sendOperationalAlertEmail({
        subject: "New marketing lead — SPECTRE",
        lines: [
          `Email: ${email}`,
          `Promotional consent: yes`,
          deal ? `Deal: ${deal}` : "",
          `Time: ${new Date().toUTCString()}`,
        ].filter(Boolean),
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
