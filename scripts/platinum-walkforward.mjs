#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';

function parseArgs(argv) {
  const out = {
    dbPath: process.env.SQLITE_DB_PATH || '/var/data/aladdin.sqlite',
    email: '',
    userId: '',
    trainDays: 60,
    testDays: 20,
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === '--db' && next) {
      out.dbPath = next;
      i += 1;
      continue;
    }

    if (token === '--email' && next) {
      out.email = next.trim().toLowerCase();
      i += 1;
      continue;
    }

    if (token === '--user' && next) {
      out.userId = next.trim();
      i += 1;
      continue;
    }

    if (token === '--train' && next) {
      out.trainDays = Math.max(20, Number.parseInt(next, 10) || out.trainDays);
      i += 1;
      continue;
    }

    if (token === '--test' && next) {
      out.testDays = Math.max(5, Number.parseInt(next, 10) || out.testDays);
      i += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      out.help = true;
      continue;
    }
  }

  return out;
}

function pct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(equitySeries) {
  if (equitySeries.length === 0) return 0;
  let peak = equitySeries[0];
  let maxDd = 0;

  for (const value of equitySeries) {
    if (value > peak) peak = value;
    const dd = peak > 0 ? value / peak - 1 : 0;
    if (dd < maxDd) maxDd = dd;
  }

  return maxDd;
}

function dailyReturns(equitySeries) {
  const returns = [];
  for (let i = 1; i < equitySeries.length; i += 1) {
    const prev = equitySeries[i - 1];
    const current = equitySeries[i];
    if (!Number.isFinite(prev) || !Number.isFinite(current) || prev <= 0 || current <= 0) continue;
    returns.push(current / prev - 1);
  }
  return returns;
}

function summarizeWindow(points) {
  const equities = points.map((row) => Number(row.equity)).filter((value) => Number.isFinite(value) && value > 0);
  if (equities.length < 2) {
    return { totalReturn: 0, vol: 0, sharpe: 0, maxDd: 0 };
  }

  const totalReturn = equities[equities.length - 1] / equities[0] - 1;
  const rets = dailyReturns(equities);
  const vol = stdDev(rets) * Math.sqrt(252);
  const sharpe = vol > 0 ? (average(rets) * 252) / vol : 0;
  const maxDd = maxDrawdown(equities);

  return { totalReturn, vol, sharpe, maxDd };
}

function resolveUserId(db, opts) {
  if (opts.userId) {
    return opts.userId;
  }

  if (opts.email) {
    const row = db
      .prepare('SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1')
      .get(opts.email);
    if (!row || !row.id) {
      throw new Error(`No user found for email ${opts.email}.`);
    }
    return String(row.id);
  }

  throw new Error('Provide --user <id> or --email <address>.');
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    console.log('Usage: node scripts/platinum-walkforward.mjs --email <email> [--db <path>] [--train 60] [--test 20]');
    console.log('   or: node scripts/platinum-walkforward.mjs --user <userId> [--db <path>] [--train 60] [--test 20]');
    return;
  }
  const db = new DatabaseSync(opts.dbPath);
  const userId = resolveUserId(db, opts);

  const rows = db
    .prepare(
      `SELECT scan_date, equity
       FROM platinum_paper_snapshots
       WHERE user_id = ?
       ORDER BY scan_date ASC`,
    )
    .all(userId);

  if (rows.length < opts.trainDays + opts.testDays + 5) {
    throw new Error(
      `Not enough snapshots for walk-forward analysis. Need at least ${opts.trainDays + opts.testDays + 5}, got ${rows.length}.`,
    );
  }

  const windows = [];
  for (let start = opts.trainDays; start + opts.testDays <= rows.length; start += opts.testDays) {
    const train = rows.slice(start - opts.trainDays, start);
    const test = rows.slice(start, start + opts.testDays);

    const trainStats = summarizeWindow(train);
    const testStats = summarizeWindow(test);

    windows.push({
      trainStart: train[0].scan_date,
      trainEnd: train[train.length - 1].scan_date,
      testStart: test[0].scan_date,
      testEnd: test[test.length - 1].scan_date,
      trainStats,
      testStats,
    });
  }

  const testReturns = windows.map((window) => window.testStats.totalReturn);
  const testSharpe = windows.map((window) => window.testStats.sharpe);
  const testMaxDd = windows.map((window) => window.testStats.maxDd);

  console.log('SPECTRE Platinum Walk-Forward Summary');
  console.log(`User: ${userId}`);
  console.log(`DB: ${opts.dbPath}`);
  console.log(`Windows: ${windows.length} (train=${opts.trainDays}, test=${opts.testDays})`);
  console.log(`Average test return: ${pct(average(testReturns))}`);
  console.log(`Median-like test stability (avg Sharpe): ${average(testSharpe).toFixed(2)}`);
  console.log(`Average test max drawdown: ${pct(average(testMaxDd))}`);
  console.log('---');

  for (const [index, window] of windows.entries()) {
    console.log(
      `${index + 1}. test ${window.testStart} -> ${window.testEnd} | return ${pct(window.testStats.totalReturn)} | sharpe ${window.testStats.sharpe.toFixed(2)} | maxDD ${pct(window.testStats.maxDd)}`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
