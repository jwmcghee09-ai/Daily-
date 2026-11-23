import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getTotpRecord, enableTotp } from "@/lib/db";
import { decryptSecret, verifyTotpCode } from "@/lib/totp";

export const runtime = "nodejs";

interface VerifyPayload {
  code?: string;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const payload = (await request.json()) as VerifyPayload;
    const code = (payload.code || "").trim();

    if (!code || code.length !== 6) {
      return NextResponse.json({ error: "Please enter a valid 6-digit code." }, { status: 400 });
    }

    const record = getTotpRecord(user.id);
    if (!record) {
      return NextResponse.json({ error: "No TOTP setup found. Please start setup first." }, { status: 400 });
    }

    if (record.enabled) {
      return NextResponse.json({ error: "Two-factor authentication is already enabled." }, { status: 400 });
    }

    const secret = decryptSecret(record.encryptedSecret);
    const valid = verifyTotpCode(secret, code);

    if (!valid) {
      return NextResponse.json({ error: "Invalid code. Please try again." }, { status: 400 });
    }

    enableTotp(user.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to verify two-factor authentication." }, { status: 500 });
  }
}
