import { isOperationalAlertConfigured, sendOperationalAlertEmail } from "@/lib/mailer";
import { captureMonitoringException } from "@/lib/monitoring";

interface WebhookFailureAlertInput {
  provider: "stripe";
  stage: string;
  message: string;
  eventId?: string | null;
  eventType?: string | null;
}

export async function notifyWebhookFailure(input: WebhookFailureAlertInput): Promise<void> {
  if (!isOperationalAlertConfigured()) {
    return;
  }

  const lines = [
    `Provider: ${input.provider}`,
    `Stage: ${input.stage}`,
    `Message: ${input.message}`,
    `Event ID: ${input.eventId || "N/A"}`,
    `Event Type: ${input.eventType || "N/A"}`,
    `Environment: ${process.env.NODE_ENV || "unknown"}`,
    `Time (UTC): ${new Date().toISOString()}`,
  ];

  try {
    await sendOperationalAlertEmail({
      subject: `[SPECTRE Alert] ${input.provider.toUpperCase()} webhook failure`,
      lines,
    });
  } catch (error) {
    console.error("Failed to send webhook failure alert", error);
    captureMonitoringException(error, {
      area: "ops_alert",
      stage: "send_email",
      metadata: {
        provider: input.provider,
        originalMessage: input.message,
      },
    });
  }
}
