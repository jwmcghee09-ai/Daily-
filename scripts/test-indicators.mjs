// Indicator maths, checked against constructed series with known answers.
//
// A subtly wrong indicator is worse than a missing one: it looks authoritative
// and nobody checks it. So each is tested against a series whose correct answer
// is obvious by construction — a pure uptrend must give a high ADX and a
// bullish MACD, a flat series must give a squeeze and no trend, and so on.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "spectre-ind-"));
// Strip the types so this runs without a TS toolchain.
const src = execFileSync("npx", ["tsc", "src/lib/indicators.ts", "--target", "es2022",
  "--module", "esnext", "--outDir", dir, "--skipLibCheck"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const mod = await import(join(dir, "indicators.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

/** Bars from a close series, with a small plausible intrabar range. */
const barsFrom = (closes, volume = 1000) =>
  closes.map((c, i) => ({
    o: i === 0 ? c : closes[i - 1],
    h: c * 1.005,
    l: c * 0.995,
    c,
    v: volume,
  }));

const N = 260;
const rising = Array.from({ length: N }, (_, i) => 100 * 1.004 ** i);
const falling = Array.from({ length: N }, (_, i) => 100 * 0.996 ** i);
const flat = Array.from({ length: N }, () => 100);
const choppy = Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 2) * 5);

// ── MACD ──
{
  const up = mod.macd(rising);
  const down = mod.macd(falling);
  check("MACD positive in an uptrend", up && up.line > 0 && up.histogram > 0, `line ${up?.line.toFixed(3)}`);
  check("MACD negative in a downtrend", down && down.line < 0, `line ${down?.line.toFixed(3)}`);
  check("MACD returns null without enough history", mod.macd(rising.slice(0, 20)) === null);

  // Crossovers are tested on NOISY series. A perfectly smooth exponential makes
  // the MACD line and its signal converge to the same constant, so their order
  // is decided by floating-point noise — degenerate input that tests nothing.
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  const noisyFall = Array.from({ length: 130 }, (_, i) => 100 * 0.996 ** i * (1 + rnd() * 0.02));
  let v = noisyFall.at(-1);
  const reversal = [...noisyFall, ...Array.from({ length: 60 }, () => { v *= 1.01 + rnd() * 0.01; return v; })];
  const rev = mod.macd(reversal);
  check("MACD detects a bullish crossover after a reversal",
    rev?.crossDirection === "bullish" && rev.crossedAgo !== null,
    `${rev?.crossDirection} ${rev?.crossedAgo} bars ago`);

  // And must NOT report a crossover through a steady decline, where the lines
  // have converged and noise flips their order every few bars.
  const steady = Array.from({ length: 190 }, (_, i) => 100 * 0.996 ** i * (1 + rnd() * 0.02));
  const st = mod.macd(steady);
  check("MACD ignores whipsaws when the lines have converged",
    st?.crossDirection === null,
    `reported ${st?.crossDirection ?? "none"}`);
}

// ── Bollinger ──
{
  const flatBands = mod.bollinger(flat);
  check("Bollinger flags a squeeze on a flat series", flatBands?.squeeze === true,
    `width ${flatBands?.widthPct.toFixed(4)}%`);
  const choppyBands = mod.bollinger(choppy);
  check("Bollinger does not flag a squeeze on a volatile series", choppyBands?.squeeze === false,
    `width ${choppyBands?.widthPct.toFixed(2)}%`);
  const upBands = mod.bollinger(rising);
  check("price rides the upper band in an uptrend", upBands && upBands.positionPct > 60,
    `${upBands?.positionPct.toFixed(0)}% of band`);
  check("upper is above mid is above lower", upBands.upper > upBands.mid && upBands.mid > upBands.lower);
}

// ── ATR ──
{
  const a = mod.atr(barsFrom(rising));
  check("ATR is positive and sane as a percentage", a && a.value > 0 && a.pct > 0 && a.pct < 10,
    `${a?.pct.toFixed(2)}% of price`);
  // A series with gaps must give a LARGER ATR than the same closes without.
  const gappy = barsFrom(rising).map((bar, i) => (i % 10 === 0 ? { ...bar, l: bar.l * 0.95 } : bar));
  check("ATR counts gaps that close-to-close volatility misses",
    mod.atr(gappy).value > mod.atr(barsFrom(rising)).value);
  check("ATR returns null without enough bars", mod.atr(barsFrom(rising.slice(0, 5))) === null);
}

// ── ADX ──
{
  const trending = mod.adx(barsFrom(rising));
  const ranging = mod.adx(barsFrom(choppy));
  check("ADX is high in a clean trend", trending && trending.adx > 25, `ADX ${trending?.adx.toFixed(1)}`);
  check("ADX is low in a range", ranging && ranging.adx < 25, `ADX ${ranging?.adx.toFixed(1)}`);
  check("+DI leads in an uptrend", trending.plusDi > trending.minusDi,
    `+DI ${trending.plusDi.toFixed(1)} vs -DI ${trending.minusDi.toFixed(1)}`);
  const down = mod.adx(barsFrom(falling));
  check("-DI leads in a downtrend", down.minusDi > down.plusDi,
    `-DI ${down.minusDi.toFixed(1)} vs +DI ${down.plusDi.toFixed(1)}`);
}

// ── Stochastic ──
{
  const high = mod.stochastic(barsFrom(rising));
  const low = mod.stochastic(barsFrom(falling));
  check("stochastic is near the top in an uptrend", high && high.k > 70, `%K ${high?.k.toFixed(1)}`);
  check("stochastic is near the bottom in a downtrend", low && low.k < 30, `%K ${low?.k.toFixed(1)}`);
}

// ── OBV ──
{
  const up = mod.obvTrend(barsFrom(rising));
  const down = mod.obvTrend(barsFrom(falling));
  check("OBV rises when closes rise", up?.direction === "rising", `${up?.slopePct.toFixed(0)}%`);
  check("OBV falls when closes fall", down?.direction === "falling", `${down?.slopePct.toFixed(0)}%`);
}

// ── Pivots ──
{
  const bars = barsFrom(choppy);
  const price = bars.at(-1).c;
  const p = mod.pivots(bars, price);
  check("pivots finds swing highs and lows", p.resistance.length > 0 && p.support.length > 0,
    `${p.resistance.length} resistance, ${p.support.length} support`);
  // The bug this guards: a swing low ABOVE the current price is not support.
  check("every support level is below the price", p.support.every((l) => l < price),
    `price ${price.toFixed(2)}, support ${p.support.map((l) => l.toFixed(2)).join(", ")}`);
  check("every resistance level is above the price", p.resistance.every((l) => l > price),
    `resistance ${p.resistance.map((l) => l.toFixed(2)).join(", ")}`);
  check("levels are deduplicated",
    new Set(p.resistance.map((l) => l.toFixed(4))).size === p.resistance.length &&
    new Set(p.support.map((l) => l.toFixed(4))).size === p.support.length);
  check("levels are ordered nearest first",
    p.resistance.length < 2 || Math.abs(p.resistance[0] - price) <= Math.abs(p.resistance[1] - price));
}

// ── Relative strength ──
{
  const leading = mod.relativeStrength(rising, flat);
  const lagging = mod.relativeStrength(flat, rising);
  check("a stock beating a flat index is leading", leading.leading === true && leading.ret90 > 0,
    `+${leading.ret90?.toFixed(1)}% vs benchmark`);
  check("a flat stock behind a rising index is lagging", lagging.leading === false && lagging.ret90 < 0,
    `${lagging.ret90?.toFixed(1)}% vs benchmark`);
  check("relative strength is null without benchmark history",
    mod.relativeStrength(rising, [100]).ret90 === null);
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll indicator checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
