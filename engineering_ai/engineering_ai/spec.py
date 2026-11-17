"""Project specification: the single data model every stage reads.

A spec can be written by hand (JSON) or produced by the AI designer (ai.py).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path

STANDARD_TYPES = ("plate", "bracket", "shaft", "flange", "enclosure")
# Implicit / additive-manufacturing parts (see computational.py)
COMPUTATIONAL_TYPES = ("gyroid_block", "lattice_block")
PART_TYPES = STANDARD_TYPES + COMPUTATIONAL_TYPES


@dataclass
class Part:
    id: str
    name: str
    type: str                      # one of PART_TYPES
    params: dict[str, float]       # dimensions in project units
    material: str = "steel"
    quantity: int = 1


@dataclass
class Task:
    id: str
    name: str
    duration_days: float
    depends_on: list[str] = field(default_factory=list)
    part_id: str | None = None     # task that produces a part (optional)


@dataclass
class Project:
    name: str
    description: str = ""
    units: str = "mm"
    parts: list[Part] = field(default_factory=list)
    tasks: list[Task] = field(default_factory=list)

    # ---- (de)serialisation -------------------------------------------------
    @classmethod
    def from_dict(cls, d: dict) -> "Project":
        parts = []
        for p in d.get("parts", []):
            params = p.get("params", {})
            # The AI returns params as a list of {name, value}; hand specs use a dict.
            if isinstance(params, list):
                params = {kv["name"]: kv["value"] for kv in params}
            parts.append(Part(id=p["id"], name=p["name"], type=p["type"],
                              params={k: float(v) for k, v in params.items()},
                              material=p.get("material", "steel"),
                              quantity=int(p.get("quantity", 1))))
        tasks = [Task(id=t["id"], name=t["name"],
                      duration_days=float(t["duration_days"]),
                      depends_on=list(t.get("depends_on", [])),
                      part_id=t.get("part_id") or None)
                 for t in d.get("tasks", [])]
        proj = cls(name=d["name"], description=d.get("description", ""),
                   units=d.get("units", "mm"), parts=parts, tasks=tasks)
        proj.validate()
        return proj

    @classmethod
    def load(cls, path: str | Path) -> "Project":
        return cls.from_dict(json.loads(Path(path).read_text()))

    def to_dict(self) -> dict:
        return asdict(self)

    def save(self, path: str | Path) -> None:
        Path(path).write_text(json.dumps(self.to_dict(), indent=2))

    # ---- validation --------------------------------------------------------
    def validate(self) -> None:
        errors = []
        part_ids = {p.id for p in self.parts}
        task_ids = [t.id for t in self.tasks]
        if len(part_ids) != len(self.parts):
            errors.append("duplicate part ids")
        if len(set(task_ids)) != len(task_ids):
            errors.append("duplicate task ids")
        for p in self.parts:
            if p.type not in PART_TYPES:
                errors.append(f"part {p.id}: unknown type '{p.type}' (use {PART_TYPES})")
        for t in self.tasks:
            if t.duration_days < 0:
                errors.append(f"task {t.id}: negative duration")
            for dep in t.depends_on:
                if dep not in task_ids:
                    errors.append(f"task {t.id}: unknown dependency '{dep}'")
            if t.part_id and t.part_id not in part_ids:
                errors.append(f"task {t.id}: unknown part '{t.part_id}'")
        if errors:
            raise ValueError("Invalid project spec:\n  " + "\n  ".join(errors))
