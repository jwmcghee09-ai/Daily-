import Link from "next/link";

export const metadata = {
  title: "Terms of Service | SPECTRE",
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 840, margin: "0 auto", padding: "64px 24px 80px", lineHeight: 1.7 }}>
      <p><Link href="/classic">Back to SPECTRE</Link></p>
      <h1>Terms of Service</h1>
      <p>SPECTRE provides portfolio analytics and workflow tools for informational purposes only. It does not provide personal financial advice, brokerage execution, tax advice, or legal advice.</p>
      <h2>Accounts</h2>
      <p>You are responsible for keeping your login credentials secure and for activity that occurs under your account.</p>
      <h2>Subscriptions</h2>
      <p>Paid plans renew through Stripe until cancelled. Cancelling a paid plan removes paid access at the end of the billing period unless Stripe states otherwise. Cancelling a subscription does not automatically delete your account or workspace data.</p>
      <h2>Acceptable Use</h2>
      <p>You agree not to misuse the service, interfere with its operation, or attempt unauthorized access to any account, system, or data.</p>
      <h2>Data and Availability</h2>
      <p>Market data, imported holdings, and AI-generated analysis may contain errors, delays, or omissions. You should independently verify material decisions before acting on them.</p>
      <h2>Liability</h2>
      <p>To the maximum extent permitted by law, SPECTRE is provided on an as-is basis without guarantees of uninterrupted availability or investment outcomes.</p>
      <h2>Contact</h2>
      <p>For support or account requests, contact <a href="mailto:admin@spectre-assets.com">admin@spectre-assets.com</a>.</p>
    </main>
  );
}
