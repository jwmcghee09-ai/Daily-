// One-command setup for the SPECTRE MCP server.
//
// The manual route asks someone to find a folder, hand-edit a JSON file they
// have never opened, paste an absolute path into it without typos, and know to
// fully quit their AI client rather than close the window. Every one of those
// is a place to silently fail, and a silent failure here looks exactly like
// broken software — the tools simply never appear.
//
// This writes the config itself. It MERGES: the file usually holds other MCP
// servers, and losing someone's Notion or GitHub connection while installing
// ours would be a far worse bug than the one being fixed. The previous file is
// backed up before anything is written.

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Where each client keeps its MCP config, per platform. */
export function clientConfigPath(client = "claude") {
  const home = homedir();
  const os = platform();
  if (client === "claude") {
    if (os === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    if (os === "win32") return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
    return join(home, ".config", "Claude", "claude_desktop_config.json");
  }
  throw new Error(`Unknown client: ${client}`);
}

/**
 * How this copy should be launched by the client.
 *
 * Run from a published package, the answer is npx — which re-resolves the
 * latest version every launch, so a copy cannot silently go stale the way a
 * checkout on a detached HEAD did. Run from a git clone, it has to be the
 * absolute path to this file, because that is the code the user actually has.
 */
export function launchCommand() {
  const here = fileURLToPath(new URL("../mcp-server.mjs", import.meta.url));
  const fromPackage = here.includes(`${join("node_modules", "spectre-mcp")}`) || here.includes("/_npx/");
  if (fromPackage) {
    return { command: "npx", args: ["-y", "spectre-mcp"], kind: "npx" };
  }
  return { command: process.execPath, args: [here], kind: "local checkout" };
}

/** Read the client's config, tolerating a missing or empty file. */
async function readConfigFile(path) {
  try {
    const raw = await readFile(path, "utf8");
    if (!raw.trim()) return { config: {}, existed: true, wasEmpty: true };
    return { config: JSON.parse(raw), existed: true, wasEmpty: false };
  } catch (error) {
    if (error.code === "ENOENT") return { config: {}, existed: false, wasEmpty: false };
    // A malformed file is the one case worth stopping on: overwriting it would
    // destroy whatever the user had, and we cannot merge what we cannot parse.
    if (error instanceof SyntaxError) {
      throw new Error(
        `${path} is not valid JSON, so it cannot be merged safely.\n` +
        `Fix or move that file, then run setup again — it will not be overwritten.`,
      );
    }
    throw error;
  }
}

/**
 * Add (or update) the spectre entry in the client's MCP config.
 * @returns what happened, for the caller to report.
 */
export async function installMcpConfig({ client = "claude", name = "spectre" } = {}) {
  const path = clientConfigPath(client);
  const { config, existed, wasEmpty } = await readConfigFile(path);
  const launch = launchCommand();

  const servers = config.mcpServers && typeof config.mcpServers === "object" ? config.mcpServers : {};
  const previous = servers[name];
  const alreadyCorrect =
    previous &&
    previous.command === launch.command &&
    JSON.stringify(previous.args) === JSON.stringify(launch.args);

  let backup = null;
  if (existed && !wasEmpty) {
    backup = `${path}.spectre-backup`;
    await copyFile(path, backup);
  }

  const next = {
    ...config,
    mcpServers: { ...servers, [name]: { command: launch.command, args: launch.args } },
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  return {
    path,
    backup,
    launch,
    created: !existed,
    replaced: Boolean(previous) && !alreadyCorrect,
    unchanged: alreadyCorrect,
    // Everything else in the file, so the caller can show it survived.
    otherServers: Object.keys(servers).filter((key) => key !== name),
  };
}
