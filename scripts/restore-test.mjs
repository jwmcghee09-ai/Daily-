#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import {
  decryptPayload,
  findLatestBackupFile,
  requireBackupPassphrase,
  resolveBackupOutputDir,
  timestampForFile,
} from "./lib/backup-utils.mjs";

function parseBackupPathArg() {
  const arg = process.argv[2];
  if (!arg) {
    return null;
  }

  if (arg === "--help" || arg === "-h") {
    console.log("Usage: npm run restore:test -- [optional-backup-file]");
    process.exit(0);
  }

  return path.isAbsolute(arg) ? arg : path.join(process.cwd(), arg);
}

function safeCount(db, tableName) {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
    return Number(row?.count || 0);
  } catch {
    return null;
  }
}

function main() {
  const passphrase = requireBackupPassphrase();
  const explicitBackupPath = parseBackupPathArg();
  const outputDir = resolveBackupOutputDir();

  const backupPath = explicitBackupPath || findLatestBackupFile(outputDir);
  if (!backupPath) {
    throw new Error(`No backup file found in ${outputDir}`);
  }

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  const decrypted = decryptPayload(payload, passphrase);
  const dbBytes = zlib.gunzipSync(decrypted);

  const tempDbPath = path.join(os.tmpdir(), `spectre-restore-test-${timestampForFile()}.sqlite`);
  fs.writeFileSync(tempDbPath, dbBytes, { mode: 0o600 });

  const db = new DatabaseSync(tempDbPath);

  try {
    const integrity = db.prepare("PRAGMA integrity_check;").get();
    const integrityValue = String(integrity?.integrity_check || "");

    if (integrityValue.toLowerCase() !== "ok") {
      throw new Error(`SQLite integrity_check failed: ${integrityValue}`);
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name)
      .join(", ");

    const users = safeCount(db, "users");
    const holdings = safeCount(db, "holdings");
    const snapshots = safeCount(db, "snapshots");

    console.log(`Restore test PASSED for backup: ${backupPath}`);
    console.log(`Tables: ${tables || "(none)"}`);
    console.log(`Row counts -> users: ${users ?? "n/a"}, holdings: ${holdings ?? "n/a"}, snapshots: ${snapshots ?? "n/a"}`);
  } finally {
    db.close();
    fs.rmSync(tempDbPath, { force: true });
  }
}

try {
  main();
} catch (error) {
  console.error("Restore test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
