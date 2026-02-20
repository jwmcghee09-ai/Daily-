import { NextResponse } from "next/server";
import { clearSessionCookie, getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const sessionUser = await getAuthenticatedUser();

  if (!sessionUser) {
    const response = NextResponse.json({ authenticated: false });
    clearSessionCookie(response);
    return response;
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: sessionUser.id,
      email: sessionUser.email,
      displayName: sessionUser.displayName,
    },
  });
}
