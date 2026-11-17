"""Project mapping algorithms.

* Kahn's algorithm  -> topological order + cycle detection
* Critical Path Method (CPM) -> earliest/latest start & finish, slack,
  critical path and total project duration
* Renderers -> Mermaid flowchart / Gantt and a Markdown report
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import date, timedelta

from .spec import Project, Task


@dataclass
class ScheduledTask:
    task: Task
    es: float  # earliest start
    ef: float  # earliest finish
    ls: float  # latest start
    lf: float  # latest finish

    @property
    def slack(self) -> float:
        return round(self.ls - self.es, 6)

    @property
    def critical(self) -> bool:
        return abs(self.slack) < 1e-9


@dataclass
class Schedule:
    order: list[ScheduledTask]
    duration: float

    @property
    def critical_path(self) -> list[ScheduledTask]:
        return [s for s in self.order if s.critical]


def topological_order(tasks: list[Task]) -> list[Task]:
    by_id = {t.id: t for t in tasks}
    indeg = {t.id: len(t.depends_on) for t in tasks}
    children: dict[str, list[str]] = {t.id: [] for t in tasks}
    for t in tasks:
        for d in t.depends_on:
            children[d].append(t.id)
    queue = deque(t.id for t in tasks if indeg[t.id] == 0)
    out = []
    while queue:
        tid = queue.popleft()
        out.append(by_id[tid])
        for c in children[tid]:
            indeg[c] -= 1
            if indeg[c] == 0:
                queue.append(c)
    if len(out) != len(tasks):
        stuck = sorted(tid for tid, n in indeg.items() if n > 0)
        raise ValueError(f"Dependency cycle detected among tasks: {stuck}")
    return out


def critical_path(project: Project) -> Schedule:
    order = topological_order(project.tasks)
    es: dict[str, float] = {}
    ef: dict[str, float] = {}
    for t in order:                                   # forward pass
        es[t.id] = max((ef[d] for d in t.depends_on), default=0.0)
        ef[t.id] = es[t.id] + t.duration_days
    duration = max(ef.values(), default=0.0)

    successors: dict[str, list[str]] = {t.id: [] for t in order}
    for t in order:
        for d in t.depends_on:
            successors[d].append(t.id)
    ls: dict[str, float] = {}
    lf: dict[str, float] = {}
    for t in reversed(order):                         # backward pass
        lf[t.id] = min((ls[s] for s in successors[t.id]), default=duration)
        ls[t.id] = lf[t.id] - t.duration_days

    return Schedule(
        order=[ScheduledTask(t, es[t.id], ef[t.id], ls[t.id], lf[t.id]) for t in order],
        duration=duration,
    )


# ---------------------------------------------------------------- renderers
def _mid(s: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in s)


def mermaid_flowchart(schedule: Schedule) -> str:
    lines = ["flowchart LR"]
    for s in schedule.order:
        t = s.task
        lines.append(f'    {_mid(t.id)}["{t.name}<br/>{t.duration_days:g} d · slack {s.slack:g}"]')
    for s in schedule.order:
        for d in s.task.depends_on:
            lines.append(f"    {_mid(d)} --> {_mid(s.task.id)}")
    crit = ",".join(_mid(s.task.id) for s in schedule.critical_path)
    if crit:
        lines.append("    classDef critical fill:#fdd,stroke:#c00,stroke-width:2px")
        lines.append(f"    class {crit} critical")
    return "\n".join(lines)


def mermaid_gantt(project: Project, schedule: Schedule, start: date) -> str:
    lines = ["gantt", f"    title {project.name}", "    dateFormat YYYY-MM-DD"]
    lines.append("    section Tasks")
    for s in schedule.order:
        tag = "crit, " if s.critical else ""
        d0 = start + timedelta(days=s.es)
        dur = max(1, round(s.task.duration_days))
        lines.append(f"    {s.task.name} :{tag}{_mid(s.task.id)}, {d0.isoformat()}, {dur}d")
    return "\n".join(lines)


def markdown_report(project: Project, schedule: Schedule, start: date,
                    cad_files: dict[str, list[str]] | None = None) -> str:
    out = [f"# {project.name}", "", project.description, "",
           f"**Total duration:** {schedule.duration:g} days "
           f"(start {start.isoformat()}, finish {(start + timedelta(days=schedule.duration)).isoformat()})",
           "",
           "**Critical path:** " + " → ".join(s.task.name for s in schedule.critical_path),
           "", "## Schedule (CPM)", "",
           "| Task | Duration | ES | EF | LS | LF | Slack | Critical |",
           "|---|---|---|---|---|---|---|---|"]
    for s in schedule.order:
        out.append(f"| {s.task.name} | {s.task.duration_days:g} | {s.es:g} | {s.ef:g} | "
                   f"{s.ls:g} | {s.lf:g} | {s.slack:g} | {'yes' if s.critical else ''} |")
    out += ["", "## Dependency map", "", "```mermaid", mermaid_flowchart(schedule), "```",
            "", "## Gantt", "", "```mermaid", mermaid_gantt(project, schedule, start), "```",
            "", "## Parts", "", f"| Part | Type | Material | Qty | Parameters ({project.units}) | CAD files |",
            "|---|---|---|---|---|---|"]
    for p in project.parts:
        params = ", ".join(f"{k}={v:g}" for k, v in p.params.items())
        files = ", ".join(f"`{f}`" for f in (cad_files or {}).get(p.id, []))
        out.append(f"| {p.name} | {p.type} | {p.material} | {p.quantity} | {params} | {files} |")
    return "\n".join(out) + "\n"
