#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  checkpointDatabase,
  createBackupFileName,
  decryptPayload,
  encryptPayload,
  requireBackupPassphrase,
  resolveBackupOutputDir,
  resolveDatabaseFilePath,
} from "./lib/backup-utils.mjs";

function main() {
  const dbPath = resolveDatabaseFilePath();
  const passphrase = requireBackupPassphrase();
  const outputDir = resolveBackupOutputDir();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`SQLite database not found at ${dbPath}`);
  }

  checkpointDatabase(dbPath);

  const raw = fs.readFileSync(dbPath);
  const gzipped = zlib.gzipSync(raw, { level: 9 });
  const payload = encryptPayload(gzipped, passphrase, {
    dbPath,
    rawSizeBytes: raw.length,
    compressedSizeBytes: gzipped.length,
  });

  fs.mkdirSync(outputDir, { recursive: true });

  const backupPath = path.join(outputDir, createBackupFileName());
  fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2), { mode: 0o600 });

  const verifyPayload = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  const verifyDecrypted = decryptPayload(verifyPayload, passphrase);
  const verifyDb = zlib.gunzipSync(verifyDecrypted);
  if (verifyDb.length !== raw.length) {
    throw new Error("Backup verification failed: byte length mismatch after decrypt/decompress.");
  }

  console.log(`Backup created: ${backupPath}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Size: ${raw.length} bytes (compressed: ${gzipped.length} bytes)`);
}

try {
  main();
} catch (error) {
  console.error("Backup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
