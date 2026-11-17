"""Local web interface:  python -m engineering_ai web  ->  http://127.0.0.1:8000"""
from __future__ import annotations

import io
import json
import os
import re
import uuid
import zipfile
from datetime import date
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file, send_from_directory

from . import cad
from .pipeline import build
from .spec import Project

STATIC = Path(__file__).parent / "static"
RUNS = Path(os.environ.get("ENGINEERING_AI_RUNS", Path.cwd() / "runs"))
EXAMPLE = Path(__file__).parent.parent / "examples" / "conveyor.json"
RUN_ID = re.compile(r"^[a-f0-9]{12}$")

app = Flask(__name__, static_folder=None)


def _run_dir(run_id: str) -> Path:
    if not RUN_ID.match(run_id):
        abort(404)
    d = RUNS / run_id
    if not d.is_dir():
        abort(404)
    return d


def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


@app.get("/api/status")
def status():
    return jsonify({
        "ai": bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")),
        "cad3d": cad.cq is not None,
        "onshape": bool(os.environ.get("ONSHAPE_ACCESS_KEY") and os.environ.get("ONSHAPE_SECRET_KEY")),
    })


@app.get("/api/example")
def example():
    return jsonify(json.loads(EXAMPLE.read_text()))


@app.post("/api/design")
def design():
    brief = (request.get_json(silent=True) or {}).get("brief", "").strip()
    if not brief:
        return _error("Describe the project first.")
    try:
        from .ai import design_project
        project = design_project(brief)
    except ImportError:
        return _error("The 'anthropic' package is not installed (pip install anthropic).")
    except Exception as e:  # surface API / validation errors to the user
        return _error(f"AI design failed: {e}", 502)
    return jsonify(project.to_dict())


@app.post("/api/build")
def build_project():
    body = request.get_json(silent=True) or {}
    try:
        project = Project.from_dict(body.get("spec") or {})
        start = date.fromisoformat(body["start"]) if body.get("start") else date.today()
    except (KeyError, TypeError) as e:
        return _error(f"Spec is missing a field: {e}")
    except ValueError as e:
        return _error(str(e))
    run_id = uuid.uuid4().hex[:12]
    try:
        result = build(project, RUNS / run_id, start)
    except ValueError as e:
        return _error(str(e))
    return jsonify({"run_id": run_id, **result.summary()})


@app.get("/runs/<run_id>/files/<path:name>")
def run_file(run_id, name):
    return send_from_directory(_run_dir(run_id), name, as_attachment=request.args.get("dl") == "1")


@app.get("/runs/<run_id>/bundle/<kind>.zip")
def run_zip(run_id, kind):
    d = _run_dir(run_id)
    roots = {"all": [d], "parts": [d / "parts"], "picogk": [d / "picogk", d / "parts"],
             "fusion360": [d / "connectors" / "fusion360", d / "parts"],
             "freecad": [d / "connectors" / "freecad", d / "parts"],
             "solidworks": [d / "connectors" / "solidworks", d / "parts"]}
    if kind not in roots:
        abort(404)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for root in roots[kind]:
            for f in sorted(root.rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(d))
    buf.seek(0)
    return send_file(buf, mimetype="application/zip", as_attachment=True,
                     download_name=f"engineering_ai_{kind}_{run_id}.zip")


@app.post("/api/onshape")
def onshape_upload():
    body = request.get_json(silent=True) or {}
    d = _run_dir(body.get("run_id", ""))
    name = body.get("file", "")
    path = (d / "parts" / name).resolve()
    if path.parent != (d / "parts").resolve() or not path.is_file():
        return _error("Unknown file.")
    doc, ws = body.get("document", "").strip(), body.get("workspace", "").strip()
    if not (doc and ws):
        return _error("Enter the Onshape document and workspace IDs.")
    try:
        from .onshape import upload
        res = upload(path, doc, ws)
    except Exception as e:
        return _error(f"Onshape upload failed: {e}", 502)
    return jsonify({"ok": True, "element": res.get("id") or res})


def serve(host: str = "127.0.0.1", port: int = 8000) -> None:
    RUNS.mkdir(parents=True, exist_ok=True)
    print(f"Engineering AI running at http://{host}:{port}  (runs saved in {RUNS})")
    app.run(host=host, port=port, debug=False)
