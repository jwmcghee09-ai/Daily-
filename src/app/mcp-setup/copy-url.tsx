"use client";

import { useState } from "react";
import styles from "./mcp-setup.module.css";

/**
 * The endpoint, and a button that copies it.
 *
 * The whole flow is "paste this URL somewhere", so the one interactive thing on
 * the page is getting it onto the clipboard without a careful drag across a
 * monospace string. Everything else here is static on purpose.
 */
export default function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access is refused in some contexts — an insecure origin, a
      // locked-down browser. The URL is on screen either way, so say nothing
      // and let the reader select it.
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.urlCard}>
      <span className={styles.urlLabel}>Your SPECTRE MCP endpoint</span>
      <code className={styles.urlValue}>{url}</code>
      <button type="button" className={styles.copyBtn} onClick={copy} disabled={copied}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
