# Load Testing

Use the built-in harness to test public/demo pages and read-only APIs against a staging URL without hand-running `ab` commands.

## Read-only profiles

Safe smoke:

```bash
npm run load:test -- --base=https://your-staging-url
```

Heavier stepped read load:

```bash
npm run load:test -- --base=https://your-staging-url --profile=heavy
```

Soak-style read profile:

```bash
npm run load:soak -- --base=https://your-staging-url
```

The soak profile targets:

- `/`
- `/signin`
- `/dashboard?demo=1`
- `/research?demo=1`
- `/api/research/quotes?demo=1`
- `/api/research/fmp?demo=1`
- `/api/research/chart?demo=1&symbol=btc&range=1m`

## Auth / write scenarios

Write flows are **disabled by default**.

To enable them, provide:

- `--writes=true` or `LOAD_TEST_ENABLE_WRITES=1`
- a dedicated staging mailbox via `--email` and `--password`

Example:

```bash
npm run load:test -- \
  --base=https://your-staging-url \
  --profile=safe \
  --writes=true \
  --email=staging-test@example.com \
  --password='YourStrongTestPassword123!'
```

That will exercise:

- register
- resend verification email
- login before verification
- password reset request

Optional completion steps:

- `--verify-token=...` to complete email verification and then test login/session/logout
- `--reset-token=...` to submit the password reset form

Example with full mailbox-assisted flow:

```bash
npm run load:test -- \
  --base=https://your-staging-url \
  --profile=safe \
  --writes=true \
  --email=staging-test@example.com \
  --password='YourStrongTestPassword123!' \
  --verify-token='paste-verification-token-here' \
  --reset-token='paste-reset-token-here'
```

## Safety notes

- Do not run write scenarios against production unless you explicitly want real emails and account records created.
- Use a dedicated staging mailbox.
- The harness does not hit uploads, AI generation, or billing checkout by default.
- The read profiles are intended to be bounded and repeatable, not destructive.
