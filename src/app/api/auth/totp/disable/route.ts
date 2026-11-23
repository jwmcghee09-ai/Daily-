import { NextResponse } from "next/server";
import { getAuthenticatedUser, verifyPassword } from "@/lib/auth";
import { disableTotp, findAuthUserByEmail } from "@/lib/db";

export const runtime = "nodejs";

interface DisablePayload {
  password?: string;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const payload = (await request.json()) as DisablePayload;
    const password = payload.password || "";

    if (password.length === 0) {
      return NextResponse.json({ error: "Password is required to disable two-factor authentication." }, { status: 400 });
    }

    const fullUser = findAuthUserByEmail(user.email);
    if (!fullUser || !verifyPassword(password, fullUser.passwordHash)) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    disableTotp(user.id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to disable two-factor authentication." }, { status: 500 });
  }
}
