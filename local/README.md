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

## Connect your own AI (MCP)

`mcp-server.mjs` exposes SPECTRE's engine over the **Model Context Protocol**, so
you can point any MCP-capable AI at your portfolio and ask it questions directly.
One server covers every client — there's nothing platform-specific to install.

It gives the AI three tools:

| Tool | What it does |
|---|---|
| `scan_stock` | Full statistics and anomaly flags for one ticker |
| `compare_stocks` | Several tickers analysed side by side |
| `analyse_portfolio` | Prices a holdings CSV and adds concentration/risk analysis |

Because the figures are computed in code before the model ever sees them, a
connected AI reasons over correct numbers instead of guessing at a chart. The
server also sends the model standing instructions: cite the figures exactly,
never recompute them, and never tell the user to buy or sell.

Check it works:

```bash
node test-mcp.mjs
```

### Claude Desktop

Add this to `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "spectre": {
      "command": "node",
      "args": ["/absolute/path/to/local/mcp-server.mjs"]
    }
  }
}
```

Restart Claude Desktop and SPECTRE appears in the tools menu. Then just ask:
*"Scan BHP and tell me what's unusual"* or *"Analyse my portfolio at
~/holdings.csv — where is my risk concentrated?"*

### LM Studio, Cursor, Zed, Open WebUI

Same server, same shape. Each client has its own config file but they all take a
command and args — point them at `mcp-server.mjs` exactly as above. Open WebUI is
the usual route if you want an **Ollama** model driving the tools, since Ollama
is a model server rather than a chat client and can't consume MCP by itself.

### Which AI should drive it?

A frontier model (Claude, GPT) reasons about a portfolio far better than anything
that runs locally, and costs you nothing extra if you already pay for it — the
data stays local either way, since these tools run on your machine and only
return the figures you asked for. Use the local Ollama path when you want the
whole loop offline and are happy to trade some reasoning quality for it.

---

## What it will not do

It does not tell you what to buy or sell. It surfaces what is statistically
unusual and explains what that has historically implied — the decision is
always yours. It also has no knowledge of news or announcements, so when a move
looks news-driven it says so and points you at the source rather than guessing.

> Possible anomalies only — statistical flags, not financial advice. You have
> the final say on every decision.
