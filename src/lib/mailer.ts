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

interface PostmarkConfig {
  serverToken: string;
  from: string;
  messageStream: string;
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

interface OperationalAlertEmailInput {
  subject: string;
  lines: string[];
}

interface PriceDipAlertEmailInput {
  toEmail: string;
  displayName: string;
  ticker: string;
  currentPrice: number;
  prevClose: number;
  dropPct: number;
  thresholdPct: number;
}

interface ResolvedSmtpTarget {
  host: string;
  tlsServername?: string;
}

interface EmailContent {
  to: string;
  subject: string;
  text: string;
  html: string;
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

function readPostmarkConfig(): PostmarkConfig | null {
  const from = (process.env.SMTP_FROM || "").trim();
  const explicitToken = (process.env.POSTMARK_SERVER_TOKEN || "").trim();
  const host = (process.env.SMTP_HOST || "").trim().toLowerCase();
  const smtpUser = (process.env.SMTP_USER || "").trim();
  const smtpPass = (process.env.SMTP_PASS || "").trim();

  // If explicit token is not set, infer it from SMTP values when Postmark SMTP is configured.
  const inferredToken = host.includes("postmarkapp.com") && smtpUser && smtpUser === smtpPass ? smtpUser : "";
  const serverToken = explicitToken || inferredToken;
  const messageStream = (process.env.POSTMARK_MESSAGE_STREAM || "outbound").trim() || "outbound";

  if (!serverToken || !from) {
    return null;
  }

  return {
    serverToken,
    from,
    messageStream,
  };
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

async function createSmtpTransporter(config: SmtpConfig) {
  const target = await resolveSmtpTarget(config);

  return nodemailer.createTransport({
    host: target.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    tls: target.tlsServername ? { servername: target.tlsServername } : undefined,
  });
}

function readOperationalAlertRecipients(): string[] {
  const raw = (process.env.ALERT_EMAIL_TO || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function isEmailDeliveryConfigured(): boolean {
  return readPostmarkConfig() != null || readSmtpConfig() != null;
}

export function isOperationalAlertConfigured(): boolean {
  return isEmailDeliveryConfigured() && readOperationalAlertRecipients().length > 0;
}

async function sendViaPostmark(config: PostmarkConfig, content: EmailContent): Promise<void> {
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": config.serverToken,
    },
    body: JSON.stringify({
      From: config.from,
      To: content.to,
      Subject: content.subject,
      TextBody: content.text,
      HtmlBody: content.html,
      MessageStream: config.messageStream,
    }),
  });

  const payload = await response.json().catch(() => null) as { ErrorCode?: number; Message?: string } | null;
  const errorCode = payload?.ErrorCode ?? -1;

  if (!response.ok || errorCode !== 0) {
    const message = payload?.Message || `HTTP ${response.status}`;
    throw new Error(`Postmark send failed (code ${errorCode}): ${message}`);
  }
}

async function sendEmail(content: EmailContent): Promise<void> {
  const postmarkConfig = readPostmarkConfig();
  if (postmarkConfig) {
    await sendViaPostmark(postmarkConfig, content);
    return;
  }

  const smtpConfig = readSmtpConfig();
  if (!smtpConfig) {
    throw new Error("Email delivery is not configured.");
  }

  const transporter = await createSmtpTransporter(smtpConfig);
  await transporter.sendMail({
    from: smtpConfig.from,
    to: content.to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  const appUrl = getAppBaseUrl();
  const token = input.resetToken;
  const tokenEntryUrl = `${appUrl}/signin?flow=reset&token=${encodeURIComponent(token)}`;

  const subject = "SPECTRE password reset";
  const text = [
    `Hi ${input.displayName},`,
    "",
    "A password reset was requested for your SPECTRE account.",
    "",
    `Reset token: ${token}`,
    "",
    "Use the reset link below to open SPECTRE with the token preloaded.",
    "If needed, you can still paste the token manually on the sign-in reset screen.",
    "",
    `Reset URL: ${tokenEntryUrl}`,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:560px;">
      <h2 style="margin:0 0 12px 0;">SPECTRE password reset</h2>
      <p>Hi ${escapeHtml(input.displayName)},</p>
      <p>A password reset was requested for your SPECTRE account.</p>
      <p><strong>Reset token:</strong><br /><code style="font-size:14px;">${escapeHtml(token)}</code></p>
      <p>Use the button below to open the reset screen with your token preloaded.</p>
      <p>
        <a
          href="${escapeAttribute(tokenEntryUrl)}"
          style="display:inline-block;background:#ff4b33;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;"
        >
          Reset Password
        </a>
      </p>
      <p style="font-size:13px;color:#555;word-break:break-all;">If the button does not work, use this link:<br />${escapeHtml(tokenEntryUrl)}</p>
      <p style="font-size:13px;color:#555;">You can also paste the token manually on the reset screen if needed.</p>
      <p style="color:#555;">If you did not request this, you can ignore this email.</p>
    </div>
  `;

  await sendEmail({
    to: input.toEmail,
    subject,
    text,
    html,
  });
}

export async function sendAccountVerificationEmail(input: AccountVerificationEmailInput): Promise<void> {
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

  await sendEmail({
    to: input.toEmail,
    subject,
    text,
    html,
  });
}

export async function sendOperationalAlertEmail(input: OperationalAlertEmailInput): Promise<void> {
  if (!isEmailDeliveryConfigured()) {
    throw new Error("Email delivery is not configured.");
  }

  const recipients = readOperationalAlertRecipients();
  if (recipients.length === 0) {
    throw new Error("Operational alert delivery is not configured.");
  }
  const appUrl = getAppBaseUrl();

  const subject = input.subject;
  const text = [...input.lines, "", `App URL: ${appUrl}`].join("\n");

  const htmlLines = input.lines
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:640px;">
      <h2 style="margin:0 0 12px 0;">${escapeHtml(subject)}</h2>
      <ul style="padding-left:18px;">${htmlLines}</ul>
      <p><a href="${escapeAttribute(appUrl)}">Open SPECTRE</a></p>
    </div>
  `;

  await sendEmail({
    to: recipients.join(","),
    subject,
    text,
    html,
  });
}

export async function sendPriceDipAlertEmail(input: PriceDipAlertEmailInput): Promise<void> {
  const appUrl = getAppBaseUrl();
  const subject = `SPECTRE alert: ${input.ticker} down ${input.dropPct.toFixed(2)}%`;
  const text = [
    `Hi ${input.displayName},`,
    "",
    "Your SPECTRE price dip alert was triggered.",
    "",
    `Ticker: ${input.ticker}`,
    `Drop: ${input.dropPct.toFixed(2)}%`,
    `Threshold: ${input.thresholdPct.toFixed(2)}%`,
    `Current price: ${input.currentPrice.toFixed(4)}`,
    `Previous close: ${input.prevClose.toFixed(4)}`,
    "",
    `Open SPECTRE: ${appUrl}`,
    "",
    "Informational analytics only. Verify with official market data before making decisions.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:620px;">
      <h2 style="margin:0 0 12px 0;">SPECTRE Price Dip Alert</h2>
      <p>Hi ${escapeHtml(input.displayName)},</p>
      <p>Your SPECTRE alert was triggered for <strong>${escapeHtml(input.ticker)}</strong>.</p>
      <table style="border-collapse:collapse;margin:10px 0;">
        <tr><td style="padding:4px 10px 4px 0;"><strong>Drop</strong></td><td>${escapeHtml(input.dropPct.toFixed(2))}%</td></tr>
        <tr><td style="padding:4px 10px 4px 0;"><strong>Threshold</strong></td><td>${escapeHtml(input.thresholdPct.toFixed(2))}%</td></tr>
        <tr><td style="padding:4px 10px 4px 0;"><strong>Current price</strong></td><td>${escapeHtml(input.currentPrice.toFixed(4))}</td></tr>
        <tr><td style="padding:4px 10px 4px 0;"><strong>Previous close</strong></td><td>${escapeHtml(input.prevClose.toFixed(4))}</td></tr>
      </table>
      <p>
        <a
          href="${escapeAttribute(appUrl)}"
          style="display:inline-block;background:#ff4b33;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;"
        >
          Open SPECTRE
        </a>
      </p>
      <p style="font-size:12px;color:#555;">Informational analytics only. Verify with official market data before making decisions.</p>
    </div>
  `;

  await sendEmail({
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
