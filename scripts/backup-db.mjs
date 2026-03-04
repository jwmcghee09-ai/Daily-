#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  checkpointDatabase,
  createBackupFileName,
  decryptPayload,
  encryptPayload,
  requireBackupPassphrase,
  resolveBackupOutputDir,
  resolveDatabaseFilePath,
} from "./lib/backup-utils.mjs";

function readBooleanEnv(name, fallback) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function normalizePrefix(prefix) {
  return prefix.replace(/^\/+/, "").replace(/\/+$/, "");
}

function readOffsiteConfig() {
  if (!readBooleanEnv("BACKUP_OFFSITE_ENABLED", false)) {
    return null;
  }

  const bucket = String(process.env.BACKUP_OFFSITE_BUCKET || "").trim();
  if (!bucket) {
    throw new Error("BACKUP_OFFSITE_BUCKET is required when BACKUP_OFFSITE_ENABLED=true.");
  }

  const region = String(process.env.BACKUP_OFFSITE_REGION || "").trim() || "us-east-1";
  const prefix = normalizePrefix(String(process.env.BACKUP_OFFSITE_PREFIX || "spectre").trim() || "spectre");
  const endpoint = String(process.env.BACKUP_OFFSITE_ENDPOINT || "").trim() || null;
  const forcePathStyle = readBooleanEnv("BACKUP_OFFSITE_FORCE_PATH_STYLE", Boolean(endpoint));
  const accessKeyId = String(process.env.BACKUP_OFFSITE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.BACKUP_OFFSITE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const verifyUpload = readBooleanEnv("BACKUP_OFFSITE_VERIFY_UPLOAD", true);
  const sseRaw = String(process.env.BACKUP_OFFSITE_SSE || "").trim().toUpperCase();

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("BACKUP_OFFSITE_ACCESS_KEY_ID and BACKUP_OFFSITE_SECRET_ACCESS_KEY are required when BACKUP_OFFSITE_ENABLED=true.");
  }

  if (sseRaw && sseRaw !== "AES256") {
    throw new Error("BACKUP_OFFSITE_SSE only supports AES256.");
  }

  return {
    bucket,
    region,
    prefix,
    endpoint,
    forcePathStyle,
    accessKeyId,
    secretAccessKey,
    verifyUpload,
    serverSideEncryption: sseRaw === "AES256" ? "AES256" : null,
  };
}

async function uploadOffsiteIfEnabled(backupPath) {
  const config = readOffsiteConfig();
  if (!config) {
    return null;
  }

  const objectKey = config.prefix ? `${config.prefix}/${path.basename(backupPath)}` : path.basename(backupPath);
  const body = fs.readFileSync(backupPath);
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: "application/json",
      ServerSideEncryption: config.serverSideEncryption || undefined,
      Metadata: {
        app: "spectre",
        format: "spectre-backup-v1",
        encrypted: "true",
      },
    }),
  );

  if (config.verifyUpload) {
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    if (!Number.isFinite(head.ContentLength) || Number(head.ContentLength) !== body.length) {
      throw new Error("Offsite backup verification failed: uploaded object size mismatch.");
    }
  }

  return {
    bucket: config.bucket,
    key: objectKey,
    endpoint: config.endpoint,
  };
}

async function main() {
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

  const offsite = await uploadOffsiteIfEnabled(backupPath);

  console.log(`Backup created: ${backupPath}`);
  console.log(`Database: ${dbPath}`);
  console.log(`Size: ${raw.length} bytes (compressed: ${gzipped.length} bytes)`);
  if (offsite) {
    console.log(`Offsite upload: s3://${offsite.bucket}/${offsite.key}`);
    if (offsite.endpoint) {
      console.log(`Offsite endpoint: ${offsite.endpoint}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error("Backup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
