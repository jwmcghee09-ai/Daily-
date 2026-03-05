import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser, normalizeEmail } from "@/lib/auth";
import styles from "./page.module.css";

const PLATINUM_EMAIL = "jwmcghee09@gmail.com";

export default async function SpectrePlatinumPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/classic");
  }

  if (normalizeEmail(user.email) !== PLATINUM_EMAIL) {
    notFound();
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <p className={styles.kicker}>Private Research Workspace</p>
          <h1 className={styles.title}>SPECTRE PLATINUM</h1>
          <p className={styles.subtitle}>
            Speculative stock analysis space for high-upside ideas, catalysts, and risk controls.
          </p>
          <Link className={styles.backLink} href="/spectre-dashboard-v3.html">
            Back to Dashboard
          </Link>
        </header>

        <section className={styles.grid}>
          <article className={styles.card}>
            <h2>Ideas Queue</h2>
            <p>Capture speculative tickers with a one-line thesis and confidence score.</p>
            <ul>
              <li>1. Ticker + setup</li>
              <li>2. Why now</li>
              <li>3. Invalidates at</li>
            </ul>
          </article>

          <article className={styles.card}>
            <h2>Catalyst Calendar</h2>
            <p>Track binary events that can reprice risk quickly.</p>
            <ul>
              <li>1. Earnings dates</li>
              <li>2. FDA / regulatory milestones</li>
              <li>3. Capital raises / lockup unlocks</li>
            </ul>
          </article>

          <article className={styles.card}>
            <h2>Risk Checklist</h2>
            <p>Define hard limits before entering speculative positions.</p>
            <ul>
              <li>1. Position size cap</li>
              <li>2. Stop / review trigger</li>
              <li>3. Max total speculative exposure</li>
            </ul>
          </article>
        </section>
      </section>
    </main>
  );
}
