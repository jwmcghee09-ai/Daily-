import * as Sentry from "@sentry/nextjs";

interface MonitoringContext {
  area?: string;
  stage?: string;
  metadata?: Record<string, unknown>;
}

export function captureMonitoringException(error: unknown, context: MonitoringContext = {}): void {
  const enabled = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
  if (!enabled) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context.area) {
      scope.setTag("area", context.area);
    }

    if (context.stage) {
      scope.setTag("stage", context.stage);
    }

    if (context.metadata) {
      Object.entries(context.metadata).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    Sentry.captureException(error);
  });
}
