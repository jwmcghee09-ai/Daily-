import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { countUnreadNotifications, markNotificationRead, readNotifications } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const notifications = readNotifications(sessionUser.id);
    const unreadCount = countUnreadNotifications(sessionUser.id);

    return NextResponse.json({ notifications, unreadCount });
  } catch {
    return NextResponse.json({ error: "Failed to load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    let body: { id?: unknown };
    try {
      body = (await request.json()) as { id?: unknown };
    } catch {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const notificationId = typeof body.id === "string" ? body.id.trim() : "";
    if (!notificationId) {
      return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    }

    markNotificationRead(sessionUser.id, notificationId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to mark notification as read." }, { status: 500 });
  }
}
