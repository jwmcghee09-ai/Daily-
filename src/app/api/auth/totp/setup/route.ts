import { NextResponse } from "next/server";

export const runtime = "nodejs";

function disabledResponse() {
  return NextResponse.json(
    { error: "Two-factor authentication is unavailable for this launch." },
    { status: 410 },
  );
}

export async function GET() {
  return disabledResponse();
}

export async function POST() {
  return disabledResponse();
}
