import { resolve4 } from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

interface PasswordResetEmailInput {
  toEmail: string;
  displayName: string;
  resetToken: string;
}

interface AccountVerificationEmailInput {
  toEmail: string;
  displayName: string;
  verificationToken: string;
}

interface ResolvedSmtpTarget {
  host: string;
  tlsServername?: string;
}

function readSmtpConfig(): SmtpConfig | null {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = (process.env.SMTP_PASS || "").trim();
  const from = (process.env.SMTP_FROM || "").trim();

  const parsedPort = Number.parseInt((process.env.SMTP_PORT || "").trim(), 10);
  const port = Number.isFinite(parsedPort) ? parsedPort : 587;

  if (!host || !user || !pass || !from) {
    return null;
  }

  const secureEnv = (process.env.SMTP_SECURE || "").trim().toLowerCase();
  const secure = secureEnv === "true" || secureEnv === "1" || port === 465;

  return { host, port, user, pass, from, secure };
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    return "";
  }

  return "";
}


function getAppBaseUrl(): string {
  const explicit = normalizeBaseUrl(process.env.APP_BASE_URL || "");
  if (explicit) {
    return explicit;
  }

  const renderUrl = normalizeBaseUrl(process.env.RENDER_EXTERNAL_URL || "");
  if (renderUrl) {
    return renderUrl;
  }

  return "http://localhost:3000";
}

function shouldForceSmtpIpv4(): boolean {
  const value = (process.env.SMTP_FORCE_IPV4 || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

async function resolveSmtpTarget(config: SmtpConfig): Promise<ResolvedSmtpTarget> {
  if (!shouldForceSmtpIpv4() || net.isIP(config.host)) {
    return { host: config.host };
  }

  try {
    const ipv4 = await resolve4(config.host);
    if (ipv4.length > 0) {
      return { host: ipv4[0], tlsServername: config.host };
    }
  } catch (error) {
    console.warn("SMTP IPv4 resolve failed, falling back to SMTP_HOST", error);
  }

  return { host: config.host };
}

export function isEmailDeliveryConfigured(): boolean {
  return readSmtpConfig() != null;
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const config = readSmtpConfig();
  if (!config) {
    throw new Error("Email delivery is not configured.");
  }

  const target = await resolveSmtpTarget(config);

  const transporter = nodemailer.createTransport({
    host: target.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: target.tlsServername ? { servername: target.tlsServername } : undefined,
  });

  const appUrl = getAppBaseUrl();
  const token = input.resetToken;
  const tokenEntryUrl = `${appUrl}/`;

  const subject = "SPECTRE password reset";
  const text = [
    `Hi ${input.displayName},`,
    "",
    "A password reset was requested for your SPECTRE account.",
    "",
    `Reset token: ${token}`,
    "",
    "Use the token in the app:",
    "1. Open the sign-in screen",
    "2. Click 'Reset With Token'",
    "3. Paste the token and choose a new password",
    "",
    `App URL: ${tokenEntryUrl}`,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px;">
      <h2 style="margin:0 0 12px 0;">SPECTRE password reset</h2>
      <p>Hi ${escapeHtml(input.displayName)},</p>
      <p>A password reset was requested for your SPECTRE account.</p>
      <p><strong>Reset token:</strong><br /><code style="font-size:14px;">${escapeHtml(token)}</code></p>
      <p>Use the token in the app:</p>
      <ol>
        <li>Open the sign-in screen</li>
        <li>Click <strong>Reset With Token</strong></li>
        <li>Paste the token and choose a new password</li>
      </ol>
      <p><a href="${escapeAttribute(tokenEntryUrl)}">Open SPECTRE</a></p>
      <p style="color:#555;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: config.from,
    to: input.toEmail,
    subject,
    text,
    html,
  });
}

export async function sendAccountVerificationEmail(input: AccountVerificationEmailInput): Promise<void> {
  const config = readSmtpConfig();
  if (!config) {
    throw new Error("Email delivery is not configured.");
  }

  const target = await resolveSmtpTarget(config);

  const transporter = nodemailer.createTransport({
    host: target.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: target.tlsServername ? { servername: target.tlsServername } : undefined,
  });

  const appUrl = getAppBaseUrl();
  const verifyUrl = `${appUrl}/api/auth/verify?token=${encodeURIComponent(input.verificationToken)}`;

  const subject = "Verify your SPECTRE email";
  const text = [
    `Hi ${input.displayName},`,
    "",
    "Welcome to SPECTRE.",
    "",
    "Please verify your email address by opening this link:",
    verifyUrl,
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px;">
      <h2 style="margin:0 0 12px 0;">Verify your SPECTRE email</h2>
      <p>Hi ${escapeHtml(input.displayName)},</p>
      <p>Welcome to SPECTRE. Please verify your email address to activate sign in.</p>
      <p>
        <a
          href="${escapeAttribute(verifyUrl)}"
          style="display:inline-block;background:#ff4b33;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;"
        >
          Verify Email
        </a>
      </p>
      <p style="font-size:13px;color:#555;word-break:break-all;">If the button does not work, use this link:<br />${escapeHtml(verifyUrl)}</p>
      <p style="color:#555;">If you did not create this account, you can ignore this email.</p>
    </div>
  `;

  await transporter.sendMail({
    from: config.from,
    to: input.toEmail,
    subject,
    text,
    html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
