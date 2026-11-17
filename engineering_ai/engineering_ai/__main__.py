"""Command line interface.

  python -m engineering_ai design "brief..." -o out/     # AI brief -> spec -> plan -> CAD
  python -m engineering_ai build examples/conveyor.json -o out/   # spec -> plan -> CAD
  python -m engineering_ai web                         # browser interface on http://127.0.0.1:8000
  python -m engineering_ai upload out/parts/P1.step --document D --workspace W
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

from .cad import cq
from .pipeline import build as run_pipeline
from .spec import Project


def build(project: Project, out: Path, start: date) -> None:
    schedule = run_pipeline(project, out, start).schedule
    print(f"Project: {project.name}")
    print(f"Duration: {schedule.duration:g} days")
    print("Critical path: " + " -> ".join(s.task.name for s in schedule.critical_path))
    print(f"Parts: {len(project.parts)} -> {out / 'parts'}")
    if cq is None:
        print("(CadQuery not installed: STEP/STL skipped; DXF + SCAD written)")
    print(f"CAD import scripts: {out / 'connectors'} (Fusion 360, FreeCAD, SolidWorks)")
    print(f"PicoGK project: {out / 'picogk'} (run with: dotnet run)")
    print(f"Report: {out / 'report.md'}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="engineering_ai")
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("design", help="generate a project from a plain-English brief (Claude)")
    d.add_argument("brief", help="the brief, or @file.txt")
    d.add_argument("-o", "--out", default="out")
    d.add_argument("--effort", default="high", choices=["low", "medium", "high", "xhigh", "max"])
    d.add_argument("--start", default=date.today().isoformat())

    b = sub.add_parser("build", help="plan + CAD from an existing project spec JSON")
    b.add_argument("spec")
    b.add_argument("-o", "--out", default="out")
    b.add_argument("--start", default=date.today().isoformat())

    w = sub.add_parser("web", help="start the web interface")
    w.add_argument("--port", type=int, default=8000)
    w.add_argument("--host", default="127.0.0.1")

    u = sub.add_parser("upload", help="upload a CAD file to Onshape")
    u.add_argument("file")
    u.add_argument("--document", required=True)
    u.add_argument("--workspace", required=True)

    a = ap.parse_args(argv)
    if a.cmd == "design":
        from .ai import design_project
        brief = Path(a.brief[1:]).read_text() if a.brief.startswith("@") else a.brief
        build(design_project(brief, a.effort), Path(a.out), date.fromisoformat(a.start))
    elif a.cmd == "build":
        build(Project.load(a.spec), Path(a.out), date.fromisoformat(a.start))
    elif a.cmd == "web":
        from .web import serve
        serve(a.host, a.port)
    else:
        from .onshape import upload
        print(upload(a.file, a.document, a.workspace))
    return 0


if __name__ == "__main__":
    sys.exit(main())
