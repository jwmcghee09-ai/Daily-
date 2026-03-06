import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser, normalizeEmail } from "@/lib/auth";
import PlatinumConsole from "./platinum-console";
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
            Full ASX universe scan · multi-factor leading-indicator model · ranked return forecasts ·
            $5,000 paper-trading engine that auto-executes BUY and SELL signals.
          </p>
          <Link className={styles.backLink} href="/spectre-dashboard-v3.html">
            Back to Dashboard
          </Link>
        </header>
        <PlatinumConsole userEmail={user.email} />
      </section>
    </main>
  );
}
