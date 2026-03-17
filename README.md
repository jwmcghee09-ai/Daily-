# SPECTRE

SPECTRE (System for Portfolio Exposure, Correlation, Threat & Risk Evaluation) is a Next.js portfolio dashboard for:
- importing super and ASX CSV holdings
- local SQLite persistence
- risk analytics and visual reporting
- live ASX price refresh (while app is open)

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Cloud Hosting (Render)

This repo includes `render.yaml` with persistent disk storage for SQLite.

### 1. Push this project to GitHub/GitLab

Render deploys from a Git repo.

### 2. Create a new Render Blueprint

In Render:
1. `New` -> `Blueprint`
2. Select your repo
3. Render reads `render.yaml` and creates the `spectre-portfolio` service

### 3. Confirm env + disk

The blueprint already sets:
- `SQLITE_DB_PATH=/var/data/aladdin.sqlite`
- persistent disk mounted at `/var/data`

This is required so your data survives restarts and deployments.

### 4. Password reset email (SMTP)

Set these environment variables in Render for production password reset:
- `APP_BASE_URL=https://your-live-domain`
- `SMTP_HOST=smtp.your-provider.com`
- `SMTP_PORT=587`
- `SMTP_USER=your-smtp-username`
- `SMTP_PASS=your-smtp-password`
- `SMTP_FROM="SPECTRE <no-reply@your-domain>"`
- optional: `SMTP_SECURE=true` (usually for port 465)
- optional: `SMTP_FORCE_IPV4=true` (recommended on Render if SMTP tries IPv6 and fails)

Without these in production, `/api/auth/password/request` returns a configuration error.

### 5. Stripe Subscriptions

Set these environment variables in Render for Stripe checkout and webhooks:
- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_PRICE_STARTER_MONTHLY=price_...`
- `STRIPE_PRO_PRICE_ID=price_...` (required for Pro checkout and Pro entitlement detection)
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `PRO_ANALYTICS_FOR_STARTER=false` (optional; set true only if you want Starter users to temporarily access Pro analytics)
- `PRO_ACCESS_EMAILS=you@example.com,second@example.com` (optional; specific accounts that should always get Pro analytics)

In Stripe dashboard, add webhook endpoint:
- `https://your-live-domain/api/webhooks/stripe`

Listen for events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The landing page includes both `Starter ($2.99/mo)` and `Pro ($9.99/mo)` Stripe Checkout buttons.
Pro analytics (Expected Shortfall, beta, tracking error) are gated by entitlement and unlock when a user's active subscription has `STRIPE_PRO_PRICE_ID`.

### Monitoring + Alerts

Set these environment variables in Render to enable monitoring:
- `SENTRY_DSN=https://...@o....ingest.sentry.io/...`
- `NEXT_PUBLIC_SENTRY_DSN=https://...@o....ingest.sentry.io/...`
- `ALERT_EMAIL_TO=ops@your-domain.com` (comma-separated allowed)

### Cloudflare Web Analytics

To enable Cloudflare Web Analytics, add this environment variable in Render:
- `NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN=your-cloudflare-token`

Once set, the app loads Cloudflare's official `beacon.min.js` script on every page.
If you use the manual setup flow in Cloudflare, paste only the token value into the env var, not the full script tag.

What this enables:
- Sentry captures server/client runtime errors.
- `GET /api/health` returns service health for uptime checks.
- Stripe webhook processing failures trigger ops alert emails.

Recommended uptime monitor target:
- `https://your-live-domain/api/health`
- Alert when status is not `200` or JSON `ok` is not true.

### 6. Deploy

After deploy, Render gives you a public URL like:
- `https://spectre-portfolio.onrender.com`

## Behavior

- Upload a new CSV when you buy/sell holdings.
- ASX prices refresh automatically every 5 minutes while the page is open.
- You can also trigger refresh manually from the `Refresh Prices` button.

## Notes

- SQLite uses Node's `node:sqlite` module.
- For production hosting, use Node 22+.

## Encrypted Backups + Restore Tests

SPECTRE now includes encrypted SQLite backup scripts and restore validation scripts.

### Required environment variable

Set a strong backup passphrase (16+ chars):

```bash
export BACKUP_PASSPHRASE='replace-with-long-random-secret'
```

Optional:
- `BACKUP_OUTPUT_DIR` (defaults to `./backups`)
- `BACKUP_RETENTION_DAYS` (defaults to `60`; older backup files are auto-pruned)
- `SQLITE_DB_PATH` (same behavior as app runtime)
- `DISK_ALERT_WARN_PCT` (defaults to `80`)
- `DISK_ALERT_CRITICAL_PCT` (defaults to `90`)
- `SNAPSHOT_RETENTION_DAYS` (defaults to `730`; old per-user snapshots are trimmed on import)
- `BACKUP_OFFSITE_ENABLED` (`true` to enable automatic offsite upload after each encrypted backup)
- `BACKUP_OFFSITE_BUCKET` (target bucket/container name)
- `BACKUP_OFFSITE_REGION` (defaults to `us-east-1`)
- `BACKUP_OFFSITE_PREFIX` (defaults to `spectre`)
- `BACKUP_OFFSITE_ENDPOINT` (optional; set for S3-compatible providers like Backblaze B2)
- `BACKUP_OFFSITE_FORCE_PATH_STYLE` (defaults to `true` when endpoint is set)
- `BACKUP_OFFSITE_ACCESS_KEY_ID`
- `BACKUP_OFFSITE_SECRET_ACCESS_KEY`
- `BACKUP_OFFSITE_VERIFY_UPLOAD` (defaults to `true`; checks uploaded object size)
- `BACKUP_OFFSITE_SSE` (optional; `AES256`)

### Create encrypted backup

```bash
npm run backup:db
```

This will:
- checkpoint WAL into the DB file
- gzip compress database bytes
- encrypt with AES-256-GCM using `BACKUP_PASSPHRASE`
- write backup JSON file to `backups/` (or `BACKUP_OUTPUT_DIR`)

### Run restore integrity test

Test latest backup:

```bash
npm run restore:test
```

Test a specific backup file:

```bash
npm run restore:test -- backups/spectre-db-YYYYMMDDTHHMMSSZ.spectre-backup.json
```

This restore test decrypts backup into a temp DB, runs `PRAGMA integrity_check`, checks table access, then deletes temp data.

### Manual restore (disaster recovery)

```bash
npm run restore:db -- backups/spectre-db-YYYYMMDDTHHMMSSZ.spectre-backup.json
```

Optional target path:

```bash
npm run restore:db -- backups/spectre-db-YYYYMMDDTHHMMSSZ.spectre-backup.json /var/data/aladdin.sqlite
```

The script will:
- decrypt + validate backup
- copy current DB to `*.pre-restore-*`
- replace target DB with restored file
- remove stale `-wal` and `-shm` sidecar files

### Offsite backup setup (S3-compatible)

Backups are encrypted before upload, so offsite storage receives only encrypted payload files.

Set these env vars on the web service (and any host running `npm run backup:db`):

```bash
BACKUP_OFFSITE_ENABLED=true
BACKUP_OFFSITE_BUCKET=your-backup-bucket
BACKUP_OFFSITE_REGION=us-east-1
BACKUP_OFFSITE_PREFIX=spectre/prod
BACKUP_OFFSITE_ACCESS_KEY_ID=...
BACKUP_OFFSITE_SECRET_ACCESS_KEY=...
```

If using Backblaze B2 (S3 API), also set:

```bash
BACKUP_OFFSITE_ENDPOINT=https://s3.<region>.backblazeb2.com
BACKUP_OFFSITE_FORCE_PATH_STYLE=true
```

Optional hardening:

```bash
BACKUP_OFFSITE_VERIFY_UPLOAD=true
BACKUP_OFFSITE_SSE=AES256
```

### Recommended ops routine

- Nightly: `npm run backup:db`
- Weekly or monthly: `npm run restore:test`
- Store backup files off-server (S3/Backblaze/etc.)

### Render Cron (recommended pattern)

Because Render Cron runs separately from your web service disk, use Cron to call internal backup endpoints on your live app:

1. Set env vars:
   - On Web Service: `BACKUP_PASSPHRASE`, `BACKUP_OUTPUT_DIR=/var/data/backups`, `BACKUP_CRON_TOKEN`, plus `BACKUP_OFFSITE_*` vars above
   - On Cron Job: `BACKUP_CRON_TOKEN` (same value)
   - If you deploy with the included `render.yaml`, it provisions `spectre-nightly-backup` and `spectre-weekly-restore-test`; set `BACKUP_BASE_URL` on those cron services to your live app URL (for example `https://spectre-portfolio.onrender.com`)

2. Cron job command for backup:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $BACKUP_CRON_TOKEN" \
  https://your-domain/api/internal/ops/backup
```

Alternative (simpler header, avoids Bearer quoting issues):

```bash
curl -fsS -X POST \
  -H "x-backup-cron-token: $BACKUP_CRON_TOKEN" \
  https://your-domain/api/internal/ops/backup
```

Alternative (query param fallback):

```bash
curl -fsS -X POST \
  "https://your-domain/api/internal/ops/backup?backup_cron_token=$BACKUP_CRON_TOKEN"
```

3. Cron job command for restore test:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $BACKUP_CRON_TOKEN" \
  https://your-domain/api/internal/ops/backup/restore-test
```

Alternative:

```bash
curl -fsS -X POST \
  -H "x-backup-cron-token: $BACKUP_CRON_TOKEN" \
  https://your-domain/api/internal/ops/backup/restore-test
```

Query param fallback:

```bash
curl -fsS -X POST \
  "https://your-domain/api/internal/ops/backup/restore-test?backup_cron_token=$BACKUP_CRON_TOKEN"
```

This ensures backups run inside the web service context that has access to `/var/data`.

## Platinum Daily Paper Scan

SPECTRE Platinum includes a paper-trading engine that:
- starts with `A$5,000` fake capital
- scans the full ASX directory daily (or `PLATINUM_ASX_UNIVERSE` override)
- uses a broad leading-indicator model (trend, momentum, volatility, volume, breakout, mean reversion factors)
- includes pattern recognition (engulfing, hammer/shooting-star, inside-bar breaks, structure trends)
- can apply an optional OpenAI overlay for AI adjustment/confidence/summary
- ranks expected return and confidence, then automatically executes paper BUY/SELL trades

API endpoints:
- User-triggered (authenticated Platinum user only): `POST /api/platinum/paper-trading`
- User live mode while ASX open: `POST /api/platinum/paper-trading?mode=live`
- User-triggered AI brief (authenticated Platinum user only): `POST /api/platinum/analysis`
- Cron-triggered (token-protected): `POST /api/internal/ops/platinum/scan`
- Cron live mode (market-hours gated): `POST /api/internal/ops/platinum/scan?mode=live`

Optional env vars:
- `PLATINUM_ASX_UNIVERSE` (comma-separated tickers, e.g. `BHP,CBA,CSL,...`)
- `PLATINUM_TIME_ZONE` (defaults to `Australia/Sydney`)
- `PLATINUM_FETCH_CONCURRENCY` (default `12`, controls parallel Yahoo requests)
- `PLATINUM_LIVE_SCAN_INTERVAL_MINUTES` (default `5`, min interval for live scans)
- `OPENAI_API_KEY` (enables AI overlay)
- `PLATINUM_AI_MODEL` (default `gpt-4.1-mini`)
- `PLATINUM_AI_MAX_CANDIDATES` (default `40`)
- `PLATINUM_REGIME_SYMBOL` (default `^AXJO`, benchmark used for risk regime detection)
- `PLATINUM_MIN_AVG_DOLLAR_VOLUME_AUD` (default `1000000`, liquidity gate for new buys)
- `PLATINUM_TARGET_ANNUAL_VOLATILITY` (default `0.18`, volatility-targeted position sizing)
- `PLATINUM_MIN_CASH_RESERVE_PCT` (default `0.08`, keeps cash buffer after buys)
- `PLATINUM_MAX_ORDER_NOTIONAL_AUD` (default `1200`, hard max notional per buy/sell order)
- `PLATINUM_MAX_ORDER_EQUITY_PCT` (default `0.2`, hard max per-order notional as % of equity)
- `PLATINUM_DAILY_LOSS_CAP_AUD` (default `300`, pauses new trades for the day once daily P/L <= `-cap`)
- `PLATINUM_KILL_SWITCH` (default `false`; set to `true` to pause auto-trading immediately)
- `PLATINUM_ENFORCE_MARKET_HOURS` (default `false`; when `true`, all scans require ASX market open unless force mode)
- `PLATINUM_MAX_POSITION_CORRELATION` (default `0.84`; correlation cap used when adding new positions)
- `PLATINUM_MAX_HIGH_CORR_EXPOSURES` (default `1`; max existing positions allowed above correlation cap)
- `PLATINUM_MAX_STALE_BAR_DAYS` (default `4`; stale data filter)
- `PLATINUM_MAX_ONE_DAY_MOVE_PCT` (default `0.27`; event-shock filter for one-day price jumps)
- `PLATINUM_BUY_SCORE_RISK_ON` / `PLATINUM_BUY_SCORE_NEUTRAL` / `PLATINUM_BUY_SCORE_RISK_OFF`
- `PLATINUM_BUY_EXPECTED_RISK_ON` / `PLATINUM_BUY_EXPECTED_NEUTRAL` / `PLATINUM_BUY_EXPECTED_RISK_OFF`
- `PLATINUM_SELL_SCORE_RISK_ON` / `PLATINUM_SELL_SCORE_NEUTRAL` / `PLATINUM_SELL_SCORE_RISK_OFF`
- `PLATINUM_MIN_ADX_RISK_ON` / `PLATINUM_MIN_ADX_NEUTRAL` / `PLATINUM_MIN_ADX_RISK_OFF`
- `PLATINUM_MIN_VOLUME_SURGE_RISK_ON` / `PLATINUM_MIN_VOLUME_SURGE_NEUTRAL` / `PLATINUM_MIN_VOLUME_SURGE_RISK_OFF`
- `PLATINUM_PATTERN_LOOKBACK_BARS` (default `18`, lookback bars for nearest-pattern forecast matching)
- `PLATINUM_PATTERN_FORECAST_HORIZON_BARS` (default `5`, forward bars for pattern-return estimation)
- `PLATINUM_PATTERN_MATCH_TOP_K` (default `30`, number of best historical matches used in pattern forecast)
- `PLATINUM_ANALYSIS_MODEL` (default `PLATINUM_AI_MODEL` or `gpt-4.1-mini`)
- `PLATINUM_ANALYSIS_TIMEOUT_MS` (default `20000`)

Render cron command example (daily run):

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $BACKUP_CRON_TOKEN" \
  https://your-domain/api/internal/ops/platinum/scan
```

Render cron command example (every 5 minutes live mode; only executes trades while ASX is open):

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $BACKUP_CRON_TOKEN" \
  "https://your-domain/api/internal/ops/platinum/scan?mode=live"
```

Walk-forward performance check from stored Platinum snapshots:

```bash
npm run platinum:walkforward -- --email you@example.com
```
