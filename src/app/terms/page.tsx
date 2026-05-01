import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth";

export const metadata = {
  title: "Terms of Service | SPECTRE",
};

export default async function TermsPage() {
  const user = await getAuthenticatedUser();
  const backHref = user ? "/dashboard?mode=account" : "/";

  return (
    <main style={{ maxWidth: 840, margin: "0 auto", padding: "64px 24px 80px", lineHeight: 1.7 }}>
      <p><Link href={backHref}>← Back to SPECTRE</Link></p>
      <h1>Terms of Service</h1>
      <p style={{ color: "#888", fontSize: "0.85rem" }}>Last updated: May 2026</p>

      <h2>1. Not Financial Advice — Important Notice</h2>
      <p>
        <strong>SPECTRE does not hold an Australian Financial Services (AFS) Licence and does not provide financial product advice within the meaning of the <em>Corporations Act 2001</em> (Cth).</strong>
      </p>
      <p>
        All content, data, analytics, risk scores, AI-generated outputs, research terminal data, and any other information provided by SPECTRE is <strong>general information only</strong>. It does not take into account your personal financial situation, objectives, or needs. Nothing on SPECTRE constitutes a recommendation, statement of opinion, or guidance to acquire, hold, or dispose of any financial product.
      </p>
      <p>
        <strong>General Advice Warning:</strong> Any general financial information provided by SPECTRE has been prepared without taking into account your objectives, financial situation or needs. Before acting on this information, you should consider its appropriateness having regard to your own objectives, financial situation and needs, and consider seeking independent financial advice from a licensed financial adviser.
      </p>
      <p>
        Market data, portfolio analytics, risk scores, AI analysis, and research terminal outputs may contain errors, delays, inaccuracies, or omissions. You should independently verify all material information before making any financial decision. Past performance is not indicative of future results.
      </p>

      <h2>2. About SPECTRE</h2>
      <p>
        SPECTRE is a portfolio analytics and data platform that provides tools for tracking, visualising, and analysing investment holdings. It aggregates market data and applies quantitative analytics to help users understand the composition and risk profile of their portfolios. It is a technology tool, not a financial service.
      </p>

      <h2>3. Accounts</h2>
      <p>You are responsible for keeping your login credentials secure and for all activity that occurs under your account.</p>

      <h2>4. Subscriptions</h2>
      <p>Paid plans renew monthly through Stripe until cancelled. Cancelling a paid plan removes paid access at the end of the current billing period. Cancelling a subscription does not automatically delete your account or workspace data.</p>

      <h2>5. Acceptable Use</h2>
      <p>You agree not to misuse the service, interfere with its operation, attempt to circumvent access controls, or use the platform for any unlawful purpose.</p>

      <h2>6. Data Accuracy</h2>
      <p>Market data, imported holdings, AI-generated analysis, and research terminal outputs are provided for informational purposes only and may contain errors, delays, or omissions. SPECTRE makes no warranty as to the accuracy, completeness, or timeliness of any data or output. You should independently verify material information before relying on it.</p>

      <h2>7. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, SPECTRE and its operators are not liable for any loss or damage (including financial loss) arising from your use of or reliance on the platform, its data, or its outputs. SPECTRE is provided on an as-is basis without guarantees of uninterrupted availability, accuracy, or investment outcomes.</p>

      <h2>8. Privacy</h2>
      <p>Your personal data is handled in accordance with our <Link href="/privacy">Privacy Policy</Link>. We do not sell your data to third parties.</p>

      <h2>9. Contact</h2>
      <p>For support or account requests, contact <a href="mailto:admin@spectre-assets.com">admin@spectre-assets.com</a>.</p>
    </main>
  );
}
