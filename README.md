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
- `STRIPE_WEBHOOK_SECRET=whsec_...`

In Stripe dashboard, add webhook endpoint:
- `https://your-live-domain/api/webhooks/stripe`

Listen for events:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

The logged-in dashboard includes a `Starter Plan ($3/mo)` button that starts Stripe Checkout.

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
- `SQLITE_DB_PATH` (same behavior as app runtime)

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

### Recommended ops routine

- Nightly: `npm run backup:db`
- Weekly or monthly: `npm run restore:test`
- Store backup files off-server (S3/Backblaze/etc.)
