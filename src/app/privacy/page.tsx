import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth";

export const metadata = {
  title: "Privacy Policy | SPECTRE",
};

export default async function PrivacyPage() {
  const user = await getAuthenticatedUser();
  const backHref = user ? "/dashboard?mode=account" : "/";

  return (
    <main style={{ maxWidth: 840, margin: "0 auto", padding: "64px 24px 80px", lineHeight: 1.7 }}>
      <p style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/spectre-mark.svg" alt="" aria-hidden="true" width={26} height={26} style={{ display: "block" }} />
        <Link href={backHref} style={{ fontWeight: 600, letterSpacing: "0.02em" }}>Back to SPECTRE</Link>
      </p>
      <h1>Privacy Policy</h1>
      <p>SPECTRE uses the information you provide to create and operate your private analytics workspace. We do not sell your portfolio data.</p>
      <h2>What We Collect</h2>
      <p>We store account details such as your email address, password hash, subscription metadata, and the holdings or snapshots you choose to import.</p>
      <h2>How We Use Data</h2>
      <p>Your data is used to authenticate your account, calculate analytics, support subscriptions, send service emails, and monitor service health.</p>
      {/*
        * Named individually and on purpose.
        *
        * This page previously said only "we do not sell your portfolio data"
        * while the marketing pages loaded a Meta Pixel. Both statements were
        * true, but a policy that does not mention a third party the site
        * actually loads is not a disclosure, and under APP 1.3 it has to be.
        * Anything added to the stack belongs in this section the same day.
        */}
      <h2>Analytics and Advertising</h2>
      <p>
        Our public marketing pages load the Meta Pixel (Meta Platforms, Inc.) and, where configured,
        Cloudflare Web Analytics. These record page views, referrers, and coarse device and location
        information so we can see whether our advertising reaches anyone. They receive data from the
        marketing pages only, and they never receive your holdings, balances, risk figures, or any other
        content of your workspace. Because Meta is a United States company, data it collects is handled
        overseas. You can block both with any standard tracker-blocking browser extension, and doing so
        does not affect your use of the product.
      </p>
      <h2>Third Parties That Process Your Data</h2>
      <p>
        When you ask the AI analyst a question, the holdings and risk figures needed to answer it are sent
        to our AI provider (OpenAI) for that request. When you connect your own assistant over the Model
        Context Protocol, your holdings go to the assistant you chose to connect and to no one else. When
        SPECTRE looks inside a fund you hold, it reads public filings from the US Securities and Exchange
        Commission and holdings pages published by fund issuers; those requests identify SPECTRE, not you.
        Market prices and news come from public market-data providers and carry no information about your
        portfolio.
      </p>
      <h2>Payments</h2>
      <p>Payments are processed by Stripe. SPECTRE does not store full payment card details on its own servers.</p>
      <h2>Retention and Deletion</h2>
      <p>You can clear imported holdings and snapshots from inside the product. Subscription cancellation does not automatically erase your account. Account deletion requests can be handled separately through support.</p>
      <h2>Security</h2>
      <p>SPECTRE uses hashed passwords, secure cookies, HTTPS in production, and backup workflows designed to reduce operational risk. No system can guarantee absolute security.</p>
      <h2>Contact</h2>
      <p>For privacy questions or deletion requests, contact <a href="mailto:admin@spectre-assets.com">admin@spectre-assets.com</a>.</p>
    </main>
  );
}
