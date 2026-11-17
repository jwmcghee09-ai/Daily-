"""One function that runs the whole pipeline; used by the CLI and the web app."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from . import cad, connectors, picogk
from .planner import Schedule, critical_path, markdown_report, mermaid_flowchart, mermaid_gantt
from .spec import Project


@dataclass
class BuildResult:
    project: Project
    schedule: Schedule
    start: date
    out: Path
    cad_files: dict[str, list[str]]
    connector_files: list[str]
    picogk_files: list[str]

    def summary(self) -> dict:
        s = self.schedule
        return {
            "name": self.project.name,
            "description": self.project.description,
            "units": self.project.units,
            "duration_days": s.duration,
            "start": self.start.isoformat(),
            "finish": (self.start + timedelta(days=s.duration)).isoformat(),
            "critical_path": [x.task.name for x in s.critical_path],
            "tasks": [{"id": x.task.id, "name": x.task.name, "duration": x.task.duration_days,
                       "depends_on": x.task.depends_on, "es": x.es, "ef": x.ef, "ls": x.ls,
                       "lf": x.lf, "slack": x.slack, "critical": x.critical} for x in s.order],
            "parts": [{"id": p.id, "name": p.name, "type": p.type, "material": p.material,
                       "quantity": p.quantity, "params": p.params,
                       "files": self.cad_files.get(p.id, [])} for p in self.project.parts],
            "flowchart": mermaid_flowchart(s),
            "gantt": mermaid_gantt(self.project, s, self.start),
            "connectors": self.connector_files,
            "picogk": self.picogk_files,
            "cad_backend_3d": cad.cq is not None,
        }


def build(project: Project, out: Path, start: date | None = None) -> BuildResult:
    start = start or date.today()
    out.mkdir(parents=True, exist_ok=True)
    project.save(out / "project.json")
    schedule = critical_path(project)
    files = {p.id: cad.export_part(p, out / "parts") for p in project.parts}
    conn = connectors.export_connectors(project, files, out / "connectors")
    pico = picogk.export_project(project, out / "picogk")
    (out / "report.md").write_text(markdown_report(project, schedule, start, files))
    return BuildResult(project, schedule, start, out, files, conn, pico)
