import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const TRADER_EMAIL = "jwmcghee09@gmail.com";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ChatBody {
  messages?: unknown;
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const vpsUrl = process.env.TRADING_VPS_URL;
  if (!vpsUrl) {
    return NextResponse.json({ error: "Trading terminal not connected. Set TRADING_VPS_URL in Render environment." }, { status: 503 });
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.TRADING_SECRET) {
    headers["X-Trading-Secret"] = process.env.TRADING_SECRET;
  }

  let res: Response;
  try {
    res = await fetch(`${vpsUrl}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: body.messages }),
      signal: AbortSignal.timeout(115000),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Could not reach Myrmidon VPS: ${msg}` }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Myrmidon VPS error: ${text}` }, { status: 502 });
  }

  const data: unknown = await res.json();
  return NextResponse.json(data);
}
