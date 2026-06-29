"""
ollama_client.py - Sends anomaly report to local Ollama and streams the response.
Requires Ollama running at http://localhost:11434 with the qwen3.6 model pulled.
"""

import json
import sys
import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen3.6"
REQUEST_TIMEOUT = 120  # seconds for the initial connection


def build_prompt(anomalies: list[dict]) -> str:
    """Format anomaly list into a structured prompt for the LLM."""
    lines = []
    for i, a in enumerate(anomalies, start=1):
        lines.append(
            f"{i}. [{a['ticker']}] {a['type'].upper()} (Severity: {a['severity']})\n"
            f"   Price: ${a['price']:.2f}  |  Daily change: {a['change_pct']:+.2f}%\n"
            f"   Details: {a['details']}"
        )

    anomaly_block = "\n\n".join(lines)

    prompt = (
        "You are a quantitative trading analyst. I've detected the following market anomalies:\n\n"
        f"{anomaly_block}\n\n"
        "For each anomaly, briefly assess:\n"
        "1. Whether it signals a trading opportunity\n"
        "2. Likely direction (bullish/bearish)\n"
        "3. Key risk to watch\n\n"
        "Be concise and actionable. Limit your total response to ~300 words."
    )
    return prompt


def query_ollama(anomalies: list[dict]) -> None:
    """
    Build a prompt from anomalies, POST to Ollama, and stream the response
    token by token to stdout.
    """
    prompt = build_prompt(anomalies)

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": True,
    }

    print("\n" + "=" * 60)
    print(f"  Ollama Analysis ({OLLAMA_MODEL})")
    print("=" * 60)

    try:
        with requests.post(
            OLLAMA_URL,
            json=payload,
            stream=True,
            timeout=REQUEST_TIMEOUT,
        ) as resp:
            if resp.status_code != 200:
                print(
                    f"[ERROR] Ollama returned HTTP {resp.status_code}: {resp.text[:200]}"
                )
                return

            for raw_line in resp.iter_lines():
                if not raw_line:
                    continue
                try:
                    chunk = json.loads(raw_line)
                except json.JSONDecodeError:
                    continue

                token = chunk.get("response", "")
                if token:
                    sys.stdout.write(token)
                    sys.stdout.flush()

                if chunk.get("done", False):
                    break

        print("\n" + "=" * 60 + "\n")

    except requests.exceptions.ConnectionError:
        print(
            "\n[Ollama not running] Could not connect to http://localhost:11434.\n"
            "Start Ollama with:  ollama serve\n"
            f"Then pull the model: ollama pull {OLLAMA_MODEL}\n"
        )
    except requests.exceptions.Timeout:
        print(
            f"\n[Ollama timeout] No response within {REQUEST_TIMEOUT}s. "
            "The model may still be loading."
        )
    except Exception as exc:
        print(f"\n[Ollama error] Unexpected error: {exc}")
