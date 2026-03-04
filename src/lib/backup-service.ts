import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { getDatabaseFilePath } from "@/lib/db";

const BACKUP_FILE_SUFFIX = ".spectre-backup.json";
const DEFAULT_BACKUP_RETENTION_DAYS = 60;

interface BackupPayload {
  version: 1;
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  compression: "gzip";
  createdAt: string;
  saltB64: string;
  ivB64: string;
  tagB64: string;
  ciphertextB64: string;
  metadata?: {
    dbPath?: string;
    rawSizeBytes?: number;
    compressedSizeBytes?: number;
  };
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function createBackupFileName(date = new Date()): string {
  return `spectre-db-${timestampForFile(date)}${BACKUP_FILE_SUFFIX}`;
}

function resolveBackupOutputDir(cwd = process.cwd()): string {
  const configured = String(process.env.BACKUP_OUTPUT_DIR || "").trim();

  if (!configured) {
    return path.join(cwd, "backups");
  }

  if (path.isAbsolute(configured)) {
    return configured;
  }

  return path.join(cwd, configured);
}

function requireBackupPassphrase(): string {
  const passphrase = String(process.env.BACKUP_PASSPHRASE || "");

  if (passphrase.length < 16) {
    throw new Error("BACKUP_PASSPHRASE must be set and at least 16 characters.");
  }

  return passphrase;
}

function closeDatabase(db: DatabaseSync): void {
  const maybeClosable = db as unknown as { close?: () => void };
  maybeClosable.close?.();
}

function checkpointDatabase(dbPath: string): void {
  const db = new DatabaseSync(dbPath);

  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    closeDatabase(db);
  }
}

function encryptPayload(plainBuffer: Buffer, passphrase: string, metadata: BackupPayload["metadata"]): BackupPayload {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    compression: "gzip",
    createdAt: new Date().toISOString(),
    saltB64: salt.toString("base64"),
    ivB64: iv.toString("base64"),
    tagB64: tag.toString("base64"),
    ciphertextB64: ciphertext.toString("base64"),
    metadata,
  };
}

function parseBackupPayload(raw: unknown): BackupPayload {
  const payload = raw as Partial<BackupPayload>;

  if (!payload || payload.version !== 1 || payload.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported backup format.");
  }

  if (!payload.saltB64 || !payload.ivB64 || !payload.tagB64 || !payload.ciphertextB64) {
    throw new Error("Backup payload is missing encryption fields.");
  }

  return payload as BackupPayload;
}

function decryptPayload(payload: BackupPayload, passphrase: string): Buffer {
  const salt = Buffer.from(payload.saltB64, "base64");
  const iv = Buffer.from(payload.ivB64, "base64");
  const tag = Buffer.from(payload.tagB64, "base64");
  const ciphertext = Buffer.from(payload.ciphertextB64, "base64");
  const key = crypto.scryptSync(passphrase, salt, 32);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function readBackupPayload(filePath: string): BackupPayload {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  return parseBackupPayload(raw);
}

function findLatestBackupFile(outputDir: string): string | null {
  if (!fs.existsSync(outputDir)) {
    return null;
  }

  const entries = fs
    .readdirSync(outputDir)
    .filter((entry) => entry.endsWith(BACKUP_FILE_SUFFIX))
    .map((entry) => path.join(outputDir, entry));

  if (entries.length === 0) {
    return null;
  }

  entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] || null;
}

function listBackupFiles(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) {
    return [];
  }

  return fs
    .readdirSync(outputDir)
    .filter((entry) => entry.endsWith(BACKUP_FILE_SUFFIX))
    .map((entry) => path.join(outputDir, entry))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
}

function readBackupRetentionDays(): number {
  const raw = String(process.env.BACKUP_RETENTION_DAYS || "").trim();
  if (!raw) {
    return DEFAULT_BACKUP_RETENTION_DAYS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_BACKUP_RETENTION_DAYS;
  }

  return Math.min(parsed, 3650);
}

function pruneOldBackupFiles(outputDir: string, retentionDays: number): { deletedCount: number; remainingCount: number } {
  const files = listBackupFiles(outputDir);
  if (files.length === 0 || retentionDays < 1) {
    return { deletedCount: 0, remainingCount: files.length };
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  for (const filePath of files) {
    const stats = fs.statSync(filePath);
    if (stats.mtimeMs >= cutoff) {
      continue;
    }
    fs.rmSync(filePath, { force: true });
    deletedCount += 1;
  }

  return { deletedCount, remainingCount: Math.max(0, files.length - deletedCount) };
}

function readDiskUsagePercent(targetPath: string): number | null {
  try {
    const stats = fs.statfsSync(targetPath);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) {
      return null;
    }
    const used = Math.max(0, total - free);
    return (used / total) * 100;
  } catch {
    return null;
  }
}

function safeCount(db: DatabaseSync, tableName: string): number | null {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as { count?: unknown } | undefined;
    return Number(row?.count || 0);
  } catch {
    return null;
  }
}

export function runEncryptedBackupNow(): {
  backupPath: string;
  databasePath: string;
  rawSizeBytes: number;
  compressedSizeBytes: number;
  backupRetentionDays: number;
  deletedBackupFiles: number;
  remainingBackupFiles: number;
  diskUsageUsedPct: number | null;
} {
  const dbPath = getDatabaseFilePath();
  const passphrase = requireBackupPassphrase();
  const outputDir = resolveBackupOutputDir();
  const backupRetentionDays = readBackupRetentionDays();

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

  const verifyPayload = readBackupPayload(backupPath);
  const verifyDb = zlib.gunzipSync(decryptPayload(verifyPayload, passphrase));

  if (verifyDb.length !== raw.length) {
    throw new Error("Backup verification failed: byte length mismatch after decrypt/decompress.");
  }

  const pruned = pruneOldBackupFiles(outputDir, backupRetentionDays);

  return {
    backupPath,
    databasePath: dbPath,
    rawSizeBytes: raw.length,
    compressedSizeBytes: gzipped.length,
    backupRetentionDays,
    deletedBackupFiles: pruned.deletedCount,
    remainingBackupFiles: pruned.remainingCount,
    diskUsageUsedPct: readDiskUsagePercent(outputDir),
  };
}

export function runRestoreIntegrityTestNow(): {
  backupPath: string;
  tables: string[];
  usersCount: number | null;
  holdingsCount: number | null;
  snapshotsCount: number | null;
} {
  const passphrase = requireBackupPassphrase();
  const outputDir = resolveBackupOutputDir();
  const backupPath = findLatestBackupFile(outputDir);

  if (!backupPath) {
    throw new Error(`No backup file found in ${outputDir}`);
  }

  const payload = readBackupPayload(backupPath);
  const dbBytes = zlib.gunzipSync(decryptPayload(payload, passphrase));
  const tempDbPath = path.join(os.tmpdir(), `.restore-test-${timestampForFile()}.sqlite`);

  fs.writeFileSync(tempDbPath, dbBytes, { mode: 0o600 });

  const db = new DatabaseSync(tempDbPath);

  try {
    const integrityRow = db.prepare("PRAGMA integrity_check;").get() as { integrity_check?: unknown } | undefined;
    const integrity = String(integrityRow?.integrity_check || "");

    if (integrity.toLowerCase() !== "ok") {
      throw new Error(`SQLite integrity_check failed: ${integrity}`);
    }

    const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>;

    return {
      backupPath,
      tables: tableRows.map((row) => row.name),
      usersCount: safeCount(db, "users"),
      holdingsCount: safeCount(db, "holdings"),
      snapshotsCount: safeCount(db, "snapshots"),
    };
  } finally {
    closeDatabase(db);
    fs.rmSync(tempDbPath, { force: true });
  }
}
