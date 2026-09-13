// Setup writes to a file that usually holds the user's OTHER MCP servers.
// Losing someone's Notion or GitHub connection while installing ours would be a
// worse bug than the one setup exists to fix, so the merge is what gets tested.
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

const realHome = process.env.HOME;
// Must await: a non-async `finally` would restore HOME and delete the directory
// while the async body was still running, and every case would then read a
// different path than it wrote to.
async function withHome(fn) {
  const home = mkdtempSync(join(tmpdir(), "spectre-setup-"));
  process.env.HOME = home;
  try { return await fn(home); } finally { process.env.HOME = realHome; rmSync(home, { recursive: true, force: true }); }
}

// homedir() reads the env at call time on POSIX, so each case gets a clean HOME.
const { installMcpConfig, clientConfigPath, launchCommand } = await import("./lib/setup.mjs");

// ── 1. No config file at all ──
await withHome(async () => {
  const result = await installMcpConfig();
  const written = JSON.parse(readFileSync(result.path, "utf8"));
  check("creates a config when none exists", result.created === true);
  check("writes the spectre server", !!written.mcpServers?.spectre, JSON.stringify(written.mcpServers?.spectre));
  check("no spurious backup for a new file", result.backup === null);
});

// ── 2. Existing config with other servers — the case that must not regress ──
await withHome(async (home) => {
  const path = clientConfigPath();
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify({
    mcpServers: {
      notion: { command: "npx", args: ["-y", "@notionhq/notion-mcp-server"] },
      github: { command: "docker", args: ["run", "ghcr.io/github/github-mcp-server"] },
    },
    globalShortcut: "Alt+Space",
  }, null, 2));

  const result = await installMcpConfig();
  const written = JSON.parse(readFileSync(result.path, "utf8"));
  check("keeps other MCP servers", !!written.mcpServers.notion && !!written.mcpServers.github,
    Object.keys(written.mcpServers).join(", "));
  check("keeps their exact config", written.mcpServers.notion.args[1] === "@notionhq/notion-mcp-server");
  check("keeps unrelated top-level settings", written.globalShortcut === "Alt+Space");
  check("adds spectre alongside", !!written.mcpServers.spectre);
  check("reports the servers it left alone", result.otherServers.sort().join(",") === "github,notion");
  check("backs the old file up", !!result.backup && existsSync(result.backup));
  const backup = JSON.parse(readFileSync(result.backup, "utf8"));
  check("backup holds the ORIGINAL content", !backup.mcpServers.spectre && !!backup.mcpServers.notion);
});

// ── 3. Re-running is idempotent, not duplicating ──
await withHome(async () => {
  await installMcpConfig();
  const second = await installMcpConfig();
  const written = JSON.parse(readFileSync(second.path, "utf8"));
  check("second run reports no change", second.unchanged === true);
  check("still exactly one spectre entry", Object.keys(written.mcpServers).filter((k) => k === "spectre").length === 1);
});

// ── 4. Malformed JSON must stop, not overwrite ──
await withHome(async () => {
  const path = clientConfigPath();
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(path, ".."), { recursive: true });
  const broken = '{ "mcpServers": { "notion": { oops';
  writeFileSync(path, broken);
  let threw = false;
  try { await installMcpConfig(); } catch { threw = true; }
  check("refuses to merge invalid JSON", threw);
  check("leaves the broken file untouched", readFileSync(path, "utf8") === broken);
});

// ── 5. An empty file is not "invalid", just empty ──
await withHome(async () => {
  const path = clientConfigPath();
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "\n");
  const result = await installMcpConfig();
  check("treats an empty file as empty config", !!JSON.parse(readFileSync(result.path, "utf8")).mcpServers.spectre);
});

// ── 6. The launch command must be runnable ──
{
  const launch = launchCommand();
  check("launch command is resolvable", typeof launch.command === "string" && launch.command.length > 0,
    `${launch.kind}: ${launch.command} ${launch.args.join(" ")}`);
}

console.log(failures === 0 ? "\nAll setup checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
