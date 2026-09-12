# SPECTRE Local

Portfolio intelligence that runs entirely on your own machine. Same anomaly
engine as the SPECTRE web scanner, with a local Ollama model writing the
explanation instead of a cloud API.

**Your holdings never leave your computer.** The only network call is fetching
public price history. There is no account, no API key, and no per-request cost.

---

## Why it is built this way

The statistics — RSI, moving averages, volatility, drawdown, concentration — are
computed by **deterministic code** in `lib/engine.mjs`. The local model never
calculates anything; it only explains numbers it was handed.

That split matters. A 7B model running on a laptop is genuinely good at turning
a structured block of figures into readable English, and genuinely bad at doing
arithmetic on a year of price bars. Letting it near the maths is how you get
confident, wrong numbers. This way the figures are as correct as the website's,
and the model does the part it is actually good at.

It is the same principle as Myrmidon's trading guardrails: the rules live in
code, the AI works inside them.

---

## Install

**1. Node 18 or newer** — check with `node --version`.

**2. Ollama** — download from [ollama.com/download](https://ollama.com/download),
then pull a base model:

```bash
ollama pull llama3.1:8b
```

**3. Build the SPECTRE model** from the `Modelfile` in this folder:

```bash
cd local
ollama create spectre -f Modelfile
```

That bakes in the SPECTRE analyst persona and its guardrails — plain English,
never invent a number, never tell you to buy or sell.

---

## Use

Scan a single stock. Bare tickers resolve to the ASX first, so `BHP` means
`BHP.AX`; use `NVDA` or `BHP.L` for other markets.

```bash
node spectre.mjs scan BHP
```

Analyse a whole portfolio from a CSV:

```bash
node spectre.mjs portfolio my-holdings.csv
```

### Options

| Flag | Effect |
|---|---|
| `--no-ai` | Statistics and flags only — no Ollama needed at all |
| `--json` | Machine-readable output for piping into other tools |
| `--model <name>` | Use a different Ollama model (default `spectre`) |
| `--host <url>` | Point at a non-default Ollama host |

If Ollama isn't running, the numbers still print and the tool tells you how to
start it. It never fails silently.

---

## Your holdings file

Any CSV with a ticker column and a units column works. Column names are matched
loosely, so most broker exports (CommSec, Selfwealth, CoinSpot) work unedited —
preamble rows above the header are skipped automatically.

```csv
Ticker,Units,Cost
BHP,300,41.20
CBA,80,98.50
NVDA,40,118.00
```

`Cost` is optional; include it and you get profit/loss per holding. Recognised
alternatives include `Code`/`Symbol`, `Quantity`/`Shares`, and `Avg Cost`.

See `sample-portfolio.csv`.

---

## Choosing a model

`llama3.1:8b` is the default and runs comfortably on most machines with 16GB of
RAM. If you have more headroom, `qwen2.5:14b` writes noticeably sharper
explanations — edit the `FROM` line in the `Modelfile` and rebuild.

Quality scales with the model. Nothing local currently matches a frontier cloud
model at reasoning about a portfolio, which is why the numbers are computed in
code rather than trusted to the model.

---

## What it will not do

It does not tell you what to buy or sell. It surfaces what is statistically
unusual and explains what that has historically implied — the decision is
always yours. It also has no knowledge of news or announcements, so when a move
looks news-driven it says so and points you at the source rather than guessing.

> Possible anomalies only — statistical flags, not financial advice. You have
> the final say on every decision.
