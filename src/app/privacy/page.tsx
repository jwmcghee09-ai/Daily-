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
      <p><Link href={backHref}>Back to SPECTRE</Link></p>
      <h1>Privacy Policy</h1>
      <p>SPECTRE uses the information you provide to create and operate your private analytics workspace. We do not sell your portfolio data.</p>
      <h2>What We Collect</h2>
      <p>We store account details such as your email address, password hash, subscription metadata, and the holdings or snapshots you choose to import.</p>
      <h2>How We Use Data</h2>
      <p>Your data is used to authenticate your account, calculate analytics, support subscriptions, send service emails, and monitor service health.</p>
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
