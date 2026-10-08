import Link from "next/link";
import { getAuthenticatedUser } from "@/lib/auth";
import { listOAuthGrants } from "@/lib/db";
import CopyUrl from "./copy-url";
import styles from "./mcp-setup.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = {
  title: "Connect your AI | SPECTRE",
  description:
    "Point Claude, ChatGPT, Cursor, VS Code or any assistant that speaks the Model Context "
    + "Protocol at your SPECTRE portfolio.",
};

const MCP_URL = "https://spectre-assets.com/api/mcp";

/**
 * Every client that can reach a hosted MCP server, and what it takes.
 *
 * The page used to describe Claude and only Claude, down to "In Claude, open
 * Settings". MCP is a protocol rather than one vendor's feature, and the server
 * built here does not care who is calling — so naming one client made the other
 * four look unsupported when they work identically.
 *
 * They split into two shapes, which is the useful thing to know: a settings
 * screen that takes a URL and walks you through signing in, or a config file
 * that takes the same URL. Nothing here needs a key, because authorisation is
 * the OAuth round trip the endpoint itself asks for.
 */
const CLIENTS: ReadonlyArray<{
  name: string;
  tag: string;
  steps: ReadonlyArray<React.ReactNode>;
  snippet?: string;
}> = [
  {
    name: "Claude",
    tag: "Web · Desktop · Mobile",
    steps: [
      <>Open <strong>Settings → Connectors</strong>.</>,
      <>Choose <strong>Add custom connector</strong> and paste the URL.</>,
      <>Sign in to SPECTRE and press <strong>Allow access</strong>.</>,
    ],
  },
  {
    name: "ChatGPT",
    tag: "Web · Desktop",
    steps: [
      <>Turn on <strong>Developer mode</strong> in advanced settings — on individual plans the
        option to add a connector only appears once it is on.</>,
      <>Open <strong>Settings → Connectors</strong> and create one from the URL.</>,
      <>Sign in to SPECTRE and allow access.</>,
    ],
  },
  {
    name: "Claude Code",
    tag: "Terminal",
    steps: [<>One command, then follow the sign-in it opens.</>],
    snippet: "claude mcp add --transport http spectre \\\n  https://spectre-assets.com/api/mcp",
  },
  {
    name: "Cursor",
    tag: "Config file",
    steps: [<>Add the server to <code className={styles.inlineCode}>~/.cursor/mcp.json</code>, then
      reload.</>],
    snippet: `{
  "mcpServers": {
    "spectre": {
      "url": "https://spectre-assets.com/api/mcp"
    }
  }
}`,
  },
  {
    name: "VS Code",
    tag: "Config file",
    steps: [
      <>Run <strong>MCP: Add Server</strong> from the command palette, or write{" "}
        <code className={styles.inlineCode}>.vscode/mcp.json</code> by hand.</>,
      <>The root key is <code className={styles.inlineCode}>servers</code> here, not{" "}
        <code className={styles.inlineCode}>mcpServers</code> — the two are easy to confuse.</>,
    ],
    snippet: `{
  "servers": {
    "spectre": {
      "type": "http",
      "url": "https://spectre-assets.com/api/mcp"
    }
  }
}`,
  },
];

const TOOLS: ReadonlyArray<readonly [string, string]> = [
  ["get_portfolio", "Your live holdings, re-read on every call, with the full analysis"],
  ["portfolio_risk", "SPECTRE's own risk engine — concentration, VaR, beta, correlations, look-through"],
  ["portfolio_funds", "What is inside each fund you hold, and what it overlaps with"],
  ["market_scan", "The full scanner on one symbol"],
  ["market_news", "Headlines SPECTRE is tracking, with source and timestamp"],
  ["market_movers", "Today's gainers, losers and most active"],
  ["macro_indicators", "Policy rates, inflation and employment"],
  ["myrmidon_status", "What the paper-trading agent currently holds"],
  ["myrmidon_decisions", "Its recent decisions and the reasoning behind each"],
  ["myrmidon_strategy", "The strategy and guardrails it runs under"],
];

export default async function McpSetupPage(props: { searchParams: SearchParams }) {
  const user = await getAuthenticatedUser();
  const params = await props.searchParams;
  const revoked = typeof params.revoked === "string" ? params.revoked : null;
  const connections = user ? listOAuthGrants(user.id) : [];

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.topbar}>
          <Link href={user ? "/dashboard" : "/"} className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/spectre-mark.svg" alt="" aria-hidden="true" width={24} height={24} className={styles.brandMark} />
            <span className={styles.brandText}>SPECTRE</span>
          </Link>
          <Link href={user ? "/dashboard" : "/"} className={styles.backLink}>
            {user ? "Back to dashboard" : "Back to site"}
          </Link>
        </nav>

        <p className={styles.eyebrow}>Model Context Protocol</p>
        <h1 className={styles.title}>
          Connect your AI to <span className={styles.titleAccent}>SPECTRE</span>
        </h1>
        <p className={styles.lede}>
          SPECTRE runs a hosted MCP server, so any assistant that speaks the protocol can read your
          portfolio and its risk analysis directly — Claude, ChatGPT, Cursor, VS Code, or anything
          else that supports it. One URL, no install, nothing to keep running.
        </p>

        <CopyUrl url={MCP_URL} />

        <p className={styles.sectionLabel}>Setup</p>
        <h2 className={styles.sectionTitle}>Paste it wherever your assistant keeps connectors</h2>
        <p className={styles.sectionSub}>
          Pick yours below. Every one of them takes the same URL — the differences are only in where
          it goes. None of them needs an API key: the endpoint asks you to sign in to SPECTRE and
          authorise it, which happens in your browser.
        </p>

        <div className={styles.clientGrid}>
          {CLIENTS.map((client) => (
            <article key={client.name} className={styles.clientCard}>
              <div className={styles.clientHead}>
                <span className={styles.clientName}>{client.name}</span>
                <span className={styles.clientTag}>{client.tag}</span>
              </div>
              <ol className={styles.steps}>
                {client.steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
              {client.snippet ? <pre className={styles.snippet}>{client.snippet}</pre> : null}
            </article>
          ))}
        </div>

        <p className={styles.note}>
          Using something else? Anything implementing the MCP <strong>Streamable HTTP</strong>{" "}
          transport will work — point it at the URL above and it will be told where to sign in.
          Then ask <em>&ldquo;how is my portfolio looking?&rdquo;</em> and it reads your live
          holdings.
        </p>

        {user && connections.length > 0 ? (
          <>
            <p className={styles.sectionLabel}>Access</p>
            <h2 className={styles.sectionTitle}>Connected now</h2>
            <div className={styles.connCard}>
              {connections.map((c) => (
                <div key={c.clientId} className={styles.connRow}>
                  <div>
                    <div className={styles.connName}>{c.clientName || c.clientId}</div>
                    <div className={styles.connSince}>
                      Since {new Date(c.createdAt).toLocaleDateString("en-AU")}
                    </div>
                  </div>
                  <form action="/api/oauth/connections" method="POST">
                    <input type="hidden" name="client_id" value={c.clientId} />
                    <button type="submit" className={styles.disconnect}>Disconnect</button>
                  </form>
                </div>
              ))}
            </div>
            {revoked === "1" ? <p className={styles.ok}>Disconnected.</p> : null}
          </>
        ) : null}
        {user && connections.length === 0 && revoked ? (
          <p className={styles.note}>No assistants are connected to your account.</p>
        ) : null}

        <p className={styles.sectionLabel}>Capability</p>
        <h2 className={styles.sectionTitle}>What it can read</h2>
        <p className={styles.sectionSub}>
          Ten tools, all read-only. A connected assistant cannot change your portfolio, place a
          trade or alter your account, and your password is never shared with it. You can disconnect
          one at any time above, which stops it working immediately rather than at expiry.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className={styles.toolTable}>
            <thead>
              <tr><th>Tool</th><th>What it does</th></tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, what]) => (
                <tr key={name}>
                  <td className={styles.toolName}>{name}</td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.divider} />

        <p className={styles.sectionLabel}>Alternative</p>
        <h2 className={styles.sectionTitle}>Run it on your own machine</h2>
        <p className={styles.sectionSub}>
          The hosted server cannot reach files on your disk. If you want an assistant to analyse a
          holdings CSV locally, the downloadable connector adds{" "}
          <code className={styles.inlineCode}>scan_stock</code>,{" "}
          <code className={styles.inlineCode}>compare_stocks</code> and{" "}
          <code className={styles.inlineCode}>analyse_portfolio</code> on top of everything above.
          It needs Node 18 or newer.
        </p>
        <pre className={styles.snippet}>{"node --version\n# then, in the unzipped folder:\nnode spectre.mjs setup"}</pre>
        <p className={styles.note}>
          <a href="/api/mcp/download" className={styles.link}>Download spectre-local.zip</a>{" "}
          — unzip it, run the setup command, and restart your assistant. It writes a session token
          to <code className={styles.inlineCode}>~/.spectre/config.json</code>, owner-readable only;
          your password is never written to disk.
        </p>

        <p className={styles.note}>
          Something not working? Check which account is connected with{" "}
          <code className={styles.inlineCode}>node spectre.mjs whoami</code>, or email{" "}
          <a href="mailto:admin@spectre-assets.com" className={styles.link}>admin@spectre-assets.com</a>.
        </p>
      </div>
    </main>
  );
}
