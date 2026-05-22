import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const TRADER_EMAIL = "jwmcghee09@gmail.com";
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "Trading credentials not configured" }, { status: 503 });
  }

  const res = await fetch(`${ALPACA_BASE}/account`, {
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch account from Alpaca" }, { status: 502 });
  }

  const data: unknown = await res.json();
  return NextResponse.json(data);
}
