import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSessionCookie, destroySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";

  if (token) {
    destroySessionToken(token);
  }

  const response = NextResponse.json({ authenticated: false });
  clearSessionCookie(response);
  return response;
}
