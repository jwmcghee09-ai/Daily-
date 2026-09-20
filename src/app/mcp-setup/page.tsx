import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth";

export const metadata = {
  title: "Connect Your AI (MCP) | SPECTRE",
  description:
    "Point Claude, or any assistant that speaks the Model Context Protocol, at your SPECTRE portfolio. Runs on your machine.",
};

const TOOLS: ReadonlyArray<readonly [string, string]> = [
  ["get_portfolio", "Your live SPECTRE holdings, re-read on every call, with full analysis"],
  ["portfolio_risk", "SPECTRE's own risk analysis — the Quant tab, as data"],
  ["market_scan", "The full scanner on one symbol — the Research tab, as data"],
  ["market_news", "Headlines SPECTRE is tracking, with source and timestamp"],
  ["market_movers", "Today's gainers, losers and most active"],
  ["macro_indicators", "Rates, inflation and employment from FRED"],
  ["scan_stock", "A lighter local scan of one ticker; no account needed"],
  ["compare_stocks", "Several tickers analysed side by side"],
  ["analyse_portfolio", "The same analysis for a holdings CSV on disk"],
  ["myrmidon_status", "What the paper-trading agent currently holds"],
  ["myrmidon_decisions", "Its recent decisions and the reasoning behind each"],
  ["myrmidon_strategy", "The strategy and guardrails it runs under"],
];

const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function Code({ children }: { children: string }) {
  return (
    <pre
      style={{
        margin: "14px 0",
        padding: "14px 16px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.09)",
        fontFamily: mono,
        fontSize: 13,
        overflowX: "auto",
      }}
    >
      <code>{children}</code>
    </pre>
  );
}

export default async function McpSetupPage() {
  const user = await getAuthenticatedUser();
  const backHref = user ? "/dashboard" : "/";

  return (
    <main style={{ maxWidth: 840, margin: "0 auto", padding: "64px 24px 80px", lineHeight: 1.7 }}>
      <p style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/spectre-mark.svg" alt="" aria-hidden="true" width={26} height={26} style={{ display: "block" }} />
        <Link href={backHref} style={{ fontWeight: 600, letterSpacing: "0.02em" }}>Back to SPECTRE</Link>
      </p>

      <h1>Connect your AI to SPECTRE</h1>
      <p>
        SPECTRE speaks the <strong>Model Context Protocol</strong>, so Claude — or any assistant that
        supports MCP — can read your portfolio and its risk analysis directly. The connector runs on
        your machine and talks to your account the same way the website does. Your holdings are not
        sent anywhere new.
      </p>

      <h2>1. Check you have Node</h2>
      <p>Node 18 or newer. Check with:</p>
      <Code>node --version</Code>
      <p>
        If that fails, install it from{" "}
        <a href="https://nodejs.org" target="_blank" rel="noreferrer noopener">nodejs.org</a>.
      </p>

      <h2>2. Download SPECTRE Local</h2>
      <p>
        <a
          href="/api/mcp/download"
          style={{
            display: "inline-block",
            marginTop: 6,
            padding: "11px 20px",
            borderRadius: 10,
            fontWeight: 600,
            color: "#fff",
            background: "linear-gradient(90deg,#ff4b33,#ff7a68)",
            textDecoration: "none",
          }}
        >
          Download spectre-local.zip
        </a>
      </p>
      <p style={{ marginTop: 14 }}>Unzip it, then open a terminal in that folder.</p>

      <h2>3. Run the setup command</h2>
      <Code>node spectre.mjs setup</Code>
      <p>
        That signs you in and writes the connector into your AI app&apos;s config for you. It merges
        with what is already there — any other connections you have set up are left alone, and the
        previous config is backed up first.
      </p>
      <p>
        It stores <strong>only a session token</strong>, in <code style={{ fontFamily: mono }}>~/.spectre/config.json</code>,
        owner-readable only. Your password is never written to disk. Tokens last 30 days; run{" "}
        <code style={{ fontFamily: mono }}>node spectre.mjs login</code> again after that.
      </p>

      <h2>4. Restart your AI app</h2>
      <p>
        Quit it completely — not just the window — and reopen it. Then ask something like{" "}
        <em>&ldquo;how is my portfolio looking?&rdquo;</em> and it will read your live holdings without you
        naming a file.
      </p>

      <h2>What your AI can do</h2>
      <p>Twelve tools, all reading the account you already maintain:</p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, margin: "14px 0" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.15)" }}>Tool</th>
              <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.15)" }}>What it does</th>
            </tr>
          </thead>
          <tbody>
            {TOOLS.map(([name, what]) => (
              <tr key={name}>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontFamily: mono, whiteSpace: "nowrap" }}>{name}</td>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <code style={{ fontFamily: mono }}>get_portfolio</code> returns the whole book, not only the
        listed securities. Cash comes back separately, and super balances and unlisted managed funds —
        which have no public quote — keep the valuation your account already holds. They still count
        toward the total and toward every weight; they simply have no RSI or volatility behind them.
      </p>

      <h2>If something goes wrong</h2>
      <p>
        Check which account is connected and that the connector is current:
      </p>
      <Code>{"node spectre.mjs whoami\nnode spectre.mjs version"}</Code>
      <p>
        If your AI reports fewer than twelve tools, it is running an older copy — download the zip
        again and re-run <code style={{ fontFamily: mono }}>node spectre.mjs setup</code>. Still stuck?
        Email <a href="mailto:admin@spectre-assets.com">admin@spectre-assets.com</a>.
      </p>
    </main>
  );
}
