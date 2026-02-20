import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { refreshAsxPrices } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const result = await refreshAsxPrices(sessionUser.id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to refresh live ASX prices." }, { status: 500 });
  }
}
