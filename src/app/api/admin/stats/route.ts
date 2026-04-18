import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = (process.env.ADMIN_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json({ error: "Not configured." }, { status: 403 });
  }

  const provided = new URL(request.url).searchParams.get("secret") ?? "";
  if (provided !== secret) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const db = getDb();

  const { total_users } = db
    .prepare("SELECT COUNT(*) AS total_users FROM users")
    .get() as { total_users: number };

  const { verified_users } = db
    .prepare("SELECT COUNT(*) AS verified_users FROM users WHERE email_verified_at IS NOT NULL AND email_verified_at != ''")
    .get() as { verified_users: number };

  const { active_subs } = db
    .prepare(`
      SELECT COUNT(*) AS active_subs FROM billing_subscriptions
      WHERE stripe_status IN ('active', 'trialing')
      AND (current_period_end IS NULL OR current_period_end > datetime('now'))
    `)
    .get() as { active_subs: number };

  const { pro_subs } = db
    .prepare(`
      SELECT COUNT(*) AS pro_subs FROM billing_subscriptions
      WHERE stripe_status IN ('active', 'trialing')
      AND stripe_price_id = ?
      AND (current_period_end IS NULL OR current_period_end > datetime('now'))
    `)
    .get(process.env.STRIPE_PRO_PRICE_ID ?? "") as { pro_subs: number };

  const { ai_calls_this_month } = db
    .prepare(`
      SELECT COALESCE(SUM(call_count), 0) AS ai_calls_this_month
      FROM ai_usage WHERE month = strftime('%Y-%m', 'now')
    `)
    .get() as { ai_calls_this_month: number };

  const { signups_last_7d } = db
    .prepare(`
      SELECT COUNT(*) AS signups_last_7d FROM users
      WHERE created_at >= datetime('now', '-7 days')
    `)
    .get() as { signups_last_7d: number };

  const recent_users = db
    .prepare(`
      SELECT u.email, u.created_at,
        CASE WHEN bs.stripe_status IN ('active','trialing') THEN bs.stripe_status ELSE 'free' END AS plan
      FROM users u
      LEFT JOIN billing_subscriptions bs ON bs.user_id = u.id
      ORDER BY u.created_at DESC LIMIT 10
    `)
    .all() as { email: string; created_at: string; plan: string }[];

  return NextResponse.json({
    total_users,
    verified_users,
    active_subscribers: active_subs,
    pro_subscribers: pro_subs,
    signups_last_7d,
    ai_calls_this_month,
    recent_users,
  });
}
