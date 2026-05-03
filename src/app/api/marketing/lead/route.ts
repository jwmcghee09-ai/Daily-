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

    const body = (await request.json()) as { email?: unknown; consent?: unknown };
    const email = normalizeEmail(String(body.email || ""));
    const consent = body.consent === true;

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
          `Time: ${new Date().toUTCString()}`,
        ],
      }).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
