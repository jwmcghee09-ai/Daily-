import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const RENDER_DISK_DIR = "/var/data";
const DEFAULT_DB_RELATIVE_PATH = path.join("data", "aladdin.sqlite");
const BACKUP_FILE_SUFFIX = ".spectre-backup.json";

function resolveDatabaseFilePath(cwd = process.cwd()) {
  const configured = String(process.env.SQLITE_DB_PATH || "").trim();

  if (!configured) {
    if (fs.existsSync(RENDER_DISK_DIR)) {
      return path.join(RENDER_DISK_DIR, "aladdin.sqlite");
    }

    return path.join(cwd, DEFAULT_DB_RELATIVE_PATH);
  }

  if (path.isAbsolute(configured)) {
    return configured;
  }

  if (fs.existsSync(RENDER_DISK_DIR)) {
    return path.join(RENDER_DISK_DIR, configured);
  }

  return path.join(cwd, configured);
}

function resolveBackupOutputDir(cwd = process.cwd()) {
  const configured = String(process.env.BACKUP_OUTPUT_DIR || "").trim();
  if (!configured) {
    return path.join(cwd, "backups");
  }

  if (path.isAbsolute(configured)) {
    return configured;
  }

  return path.join(cwd, configured);
}

function requireBackupPassphrase() {
  const passphrase = String(process.env.BACKUP_PASSPHRASE || "");
  if (passphrase.length < 16) {
    throw new Error("BACKUP_PASSPHRASE must be set and at least 16 characters.");
  }

  return passphrase;
}

function checkpointDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);

  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    db.close();
  }
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function createBackupFileName(date = new Date()) {
  return `spectre-db-${timestampForFile(date)}${BACKUP_FILE_SUFFIX}`;
}

function encryptPayload(plainBuffer, passphrase, metadata = {}) {
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

function decryptPayload(payload, passphrase) {
  if (!payload || payload.version !== 1 || payload.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported backup format.");
  }

  const salt = Buffer.from(String(payload.saltB64 || ""), "base64");
  const iv = Buffer.from(String(payload.ivB64 || ""), "base64");
  const tag = Buffer.from(String(payload.tagB64 || ""), "base64");
  const ciphertext = Buffer.from(String(payload.ciphertextB64 || ""), "base64");
  const key = crypto.scryptSync(passphrase, salt, 32);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function listBackupFiles(outputDir) {
  if (!fs.existsSync(outputDir)) {
    return [];
  }

  return fs
    .readdirSync(outputDir)
    .filter((entry) => entry.endsWith(BACKUP_FILE_SUFFIX))
    .map((entry) => path.join(outputDir, entry));
}

function findLatestBackupFile(outputDir) {
  const files = listBackupFiles(outputDir)
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files.length > 0 ? files[0].filePath : null;
}

export {
  BACKUP_FILE_SUFFIX,
  checkpointDatabase,
  createBackupFileName,
  decryptPayload,
  encryptPayload,
  findLatestBackupFile,
  requireBackupPassphrase,
  resolveBackupOutputDir,
  resolveDatabaseFilePath,
  timestampForFile,
};
