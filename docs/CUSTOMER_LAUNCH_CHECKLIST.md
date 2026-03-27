# Customer Launch Checklist

## Product Trust
- Review Terms of Service and Privacy Policy for accuracy.
- Confirm support email and cancellation language are correct.
- Verify pricing copy matches Stripe prices.

## Customer Flows
- Create a new account.
- Verify the email.
- Sign in and sign out.
- Start Starter checkout.
- Start Pro checkout.
- Open Stripe billing portal.
- Request password reset and complete reset.

## Operations
- Confirm Render env vars are present.
- Confirm backups run successfully.
- Run a restore test against the latest backup.
- Confirm Sentry and health checks are reporting.

## Release Quality
- Run lint.
- Run build.
- Test desktop and mobile views.
- Verify dashboard and settings legacy URLs redirect to protected routes.
