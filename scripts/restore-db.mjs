#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import {
  decryptPayload,
  requireBackupPassphrase,
  resolveDatabaseFilePath,
  timestampForFile,
} from "./lib/backup-utils.mjs";

function parseArgs() {
  const backupArg = process.argv[2];
  const targetArg = process.argv[3];

  if (!backupArg || backupArg === "--help" || backupArg === "-h") {
    console.log("Usage: npm run restore:db -- <backup-file> [target-db-path]");
    process.exit(0);
  }

  const backupPath = path.isAbsolute(backupArg) ? backupArg : path.join(process.cwd(), backupArg);
  const targetPath = targetArg
    ? (path.isAbsolute(targetArg) ? targetArg : path.join(process.cwd(), targetArg))
    : resolveDatabaseFilePath();

  return { backupPath, targetPath };
}

function main() {
  const passphrase = requireBackupPassphrase();
  const { backupPath, targetPath } = parseArgs();

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  const decrypted = decryptPayload(payload, passphrase);
  const dbBytes = zlib.gunzipSync(decrypted);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const preRestoreCopy = `${targetPath}.pre-restore-${timestampForFile()}`;
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, preRestoreCopy);
    console.log(`Existing DB backed up to: ${preRestoreCopy}`);
  }

  const tempPath = `${targetPath}.restore-tmp`;
  fs.writeFileSync(tempPath, dbBytes, { mode: 0o600 });

  const db = new DatabaseSync(tempPath);
  try {
    const integrity = db.prepare("PRAGMA integrity_check;").get();
    const integrityValue = String(integrity?.integrity_check || "");
    if (integrityValue.toLowerCase() !== "ok") {
      throw new Error(`Restored database failed integrity_check: ${integrityValue}`);
    }
  } finally {
    db.close();
  }

  fs.renameSync(tempPath, targetPath);
  fs.rmSync(`${targetPath}-wal`, { force: true });
  fs.rmSync(`${targetPath}-shm`, { force: true });

  console.log(`Database restored to: ${targetPath}`);
  console.log("Restore integrity check passed.");
}

try {
  main();
} catch (error) {
  console.error("Restore failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
