"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", background: "#0b0b0f", color: "#f4f4f5" }}>
        <h2>Something went wrong.</h2>
        <p>Please refresh the page. If the issue continues, contact support.</p>
      </body>
    </html>
  );
}
