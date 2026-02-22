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

Without these in production, `/api/auth/password/request` returns a configuration error.

### 5. Deploy

After deploy, Render gives you a public URL like:
- `https://spectre-portfolio.onrender.com`

## Behavior

- Upload a new CSV when you buy/sell holdings.
- ASX prices refresh automatically every 5 minutes while the page is open.
- You can also trigger refresh manually from the `Refresh Prices` button.

## Notes

- SQLite uses Node's `node:sqlite` module.
- For production hosting, use Node 22+.
