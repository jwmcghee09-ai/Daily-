import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth";
import { listOAuthGrants } from "@/lib/db";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

export default async function McpSetupPage(props: { searchParams: SearchParams }) {
  const user = await getAuthenticatedUser();
  const backHref = user ? "/dashboard" : "/";
  const params = await props.searchParams;
  const revoked = typeof params.revoked === "string" ? params.revoked : null;
  const connections = user ? listOAuthGrants(user.id) : [];

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
        supports MCP — can read your portfolio and its risk analysis directly.
      </p>

      <h2>The quick way: paste a URL</h2>
      <p>
        No download, no terminal, nothing to install. Works in the browser and on a phone, not just
        on a desktop.
      </p>
      <Code>{"https://spectre-assets.com/api/mcp"}</Code>
      <ol style={{ paddingLeft: 20, lineHeight: 1.9 }}>
        <li>In Claude, open <strong>Settings → Connectors</strong>.</li>
        <li>Choose <strong>Add custom connector</strong> and paste the URL above.</li>
        <li>Sign in to SPECTRE when it asks, and press <strong>Allow access</strong>.</li>
      </ol>
      <p>
        That is it. Ask <em>&ldquo;how is my portfolio looking?&rdquo;</em> and it reads your live
        holdings. The connection is read-only: it cannot change your portfolio, place a trade or
        alter your account, and your password is never shared with it.
      </p>

      {user && connections.length > 0 ? (
        <>
          <h3 style={{ marginTop: 30 }}>Connected right now</h3>
          {revoked === "1" ? <p style={{ color: "#0a7d3c" }}>Disconnected.</p> : null}
          <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
            {connections.map((c) => (
              <li key={c.clientId}>
                {c.clientName || c.clientId}
                {" — "}
                <form action="/api/oauth/connections" method="POST" style={{ display: "inline" }}>
                  <input type="hidden" name="client_id" value={c.clientId} />
                  <button
                    type="submit"
                    style={{
                      font: "inherit", color: "#c7300f", background: "none", border: 0,
                      padding: 0, cursor: "pointer", textDecoration: "underline",
                    }}
                  >
                    disconnect
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {user && connections.length === 0 && revoked ? (
        <p style={{ marginTop: 18 }}>No assistants are connected to your account.</p>
      ) : null}

      <h2 style={{ marginTop: 40 }}>The other way: run it on your machine</h2>
      <p>
        If you would rather the connector ran locally — it also analyses CSV files on your own disk,
        which the hosted one cannot reach — the download below still works.
      </p>

      <h3>1. Check you have Node</h3>
      <p>Node 18 or newer. Check with:</p>
      <Code>node --version</Code>
      <p>
        If that fails, install it from{" "}
        <a href="https://nodejs.org" target="_blank" rel="noreferrer noopener">nodejs.org</a>.
      </p>

      <h3>2. Download SPECTRE Local</h3>
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

      <h3>3. Run the setup command</h3>
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

      <h3>4. Restart your AI app</h3>
      <p>
        Quit it completely — not just the window — and reopen it. Then ask something like{" "}
        <em>&ldquo;how is my portfolio looking?&rdquo;</em> and it will read your live holdings without you
        naming a file.
      </p>

      <h2 style={{ marginTop: 40 }}>What your AI can do</h2>
      <p>
        All reading the account you already maintain. The hosted connector serves ten of these; the
        local one adds <code style={{ fontFamily: mono }}>scan_stock</code>,{" "}
        <code style={{ fontFamily: mono }}>compare_stocks</code> and{" "}
        <code style={{ fontFamily: mono }}>analyse_portfolio</code>, which read files on your own
        machine.
      </p>
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
