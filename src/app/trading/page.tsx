import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import TradingClient from "./trading-client";

export const metadata = { title: "Myrmidon Terminal — SPECTRE" };

const TRADER_EMAIL = "jwmcghee09@gmail.com";

export default async function TradingPage() {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) redirect("/signin");
  return <TradingClient />;
}
