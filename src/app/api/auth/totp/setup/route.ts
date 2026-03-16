import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { isUserTotpEnabled, saveTotpSecret, saveRecoveryCodes } from "@/lib/db";
import { generateTotpSecret, encryptSecret, generateRecoveryCodes, hashRecoveryCode } from "@/lib/totp";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const enabled = isUserTotpEnabled(user.id);
    return NextResponse.json({ enabled });
  } catch {
    return NextResponse.json({ error: "Failed to check 2FA status." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { secret, uri } = generateTotpSecret();
    const encryptedSecret = encryptSecret(secret);

    saveTotpSecret(user.id, encryptedSecret);

    const recoveryCodes = generateRecoveryCodes();
    const hashedCodes = recoveryCodes.map(hashRecoveryCode);
    saveRecoveryCodes(user.id, JSON.stringify(hashedCodes));

    return NextResponse.json({ uri, recoveryCodes });
  } catch {
    return NextResponse.json({ error: "Failed to set up two-factor authentication." }, { status: 500 });
  }
}
