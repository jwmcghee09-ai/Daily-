import math
from pathlib import Path

import pytest

from engineering_ai.cad import cq, export_part, build_solid
from engineering_ai.planner import critical_path
from engineering_ai.spec import Project

EXAMPLE = Path(__file__).parent.parent / "examples" / "conveyor.json"


def tiny(tasks, parts=()):
    return Project.from_dict({"name": "t", "tasks": tasks, "parts": list(parts)})


def test_cpm_textbook():
    p = tiny([
        {"id": "A", "name": "A", "duration_days": 3},
        {"id": "B", "name": "B", "duration_days": 2, "depends_on": ["A"]},
        {"id": "C", "name": "C", "duration_days": 5, "depends_on": ["A"]},
        {"id": "D", "name": "D", "duration_days": 1, "depends_on": ["B", "C"]},
    ])
    s = critical_path(p)
    assert s.duration == 9
    assert [x.task.id for x in s.critical_path] == ["A", "C", "D"]
    assert {x.task.id: x.slack for x in s.order}["B"] == 3


def test_cycle_detected():
    p = tiny([{"id": "A", "name": "A", "duration_days": 1, "depends_on": ["B"]},
              {"id": "B", "name": "B", "duration_days": 1, "depends_on": ["A"]}])
    with pytest.raises(ValueError, match="cycle"):
        critical_path(p)


def test_bad_reference_rejected():
    with pytest.raises(ValueError, match="unknown dependency"):
        tiny([{"id": "A", "name": "A", "duration_days": 1, "depends_on": ["Z"]}])


def test_example_builds(tmp_path):
    proj = Project.load(EXAMPLE)
    assert critical_path(proj).duration == 22
    for part in proj.parts:
        files = export_part(part, tmp_path)
        assert f"{part.id}.dxf" in files and f"{part.id}.scad" in files
        for f in files:
            assert (tmp_path / f).stat().st_size > 0


@pytest.mark.skipif(cq is None, reason="CadQuery not installed")
def test_plate_volume_has_holes():
    proj = Project.load(EXAMPLE)
    plate = next(p for p in proj.parts if p.type == "plate")
    vol = build_solid(plate).val().Volume()
    assert vol == pytest.approx(200 * 250 * 10 - 4 * math.pi * 6 ** 2 * 10, rel=1e-6)
