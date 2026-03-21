import { TOTP, Secret } from "otpauth";
import crypto from "node:crypto";

const TOTP_ENCRYPTION_KEY = (() => {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("TOTP_ENCRYPTION_KEY environment variable must be set in production");
  }
  return key || "default-dev-key-change-in-prod-32ch";
})();

export function generateTotpSecret(): { secret: string; uri: string } {
  const totp = new TOTP({
    issuer: "SPECTRE",
    label: "spectre-assets.com",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: new Secret(),
  });
  return { secret: totp.secret.base32, uri: totp.toString() };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new TOTP({
    issuer: "SPECTRE",
    label: "spectre-assets.com",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export function encryptSecret(plaintext: string): string {
  const key = crypto.scryptSync(TOTP_ENCRYPTION_KEY, "spectre-totp-salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, encrypted] = ciphertext.split(":");
  const key = crypto.scryptSync(TOTP_ENCRYPTION_KEY, "spectre-totp-salt", 32);
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase()).digest("hex");
}
