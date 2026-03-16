import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { error: "Two-factor authentication is unavailable for this launch." },
    { status: 410 },
  );
}
