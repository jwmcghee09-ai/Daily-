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
        if part.type in ("gyroid_block", "lattice_block"):
            assert files == [f"{part.id}.stl"]
        else:
            assert f"{part.id}.dxf" in files and f"{part.id}.scad" in files
        for f in files:
            assert (tmp_path / f).stat().st_size > 0


@pytest.mark.skipif(cq is None, reason="CadQuery not installed")
def test_plate_volume_has_holes():
    proj = Project.load(EXAMPLE)
    plate = next(p for p in proj.parts if p.type == "plate")
    vol = build_solid(plate).val().Volume()
    assert vol == pytest.approx(200 * 250 * 10 - 4 * math.pi * 6 ** 2 * 10, rel=1e-6)


# ---------------------------------------------------------------- new modules
from engineering_ai import computational, connectors, picogk  # noqa: E402
from engineering_ai.pipeline import build  # noqa: E402
from engineering_ai.spec import Part  # noqa: E402


@pytest.mark.parametrize("kind", ["gyroid_block", "lattice_block"])
def test_computational_parts_are_closed_and_light(kind):
    part = Part(id="X", name=kind, type=kind, params={})
    v, f = computational.mesh(part)
    vol = computational.mesh_volume(v, f)
    full = 60 * 60 * 30
    assert 0.1 * full < vol < 0.7 * full          # lighter than solid, not empty
    assert v.min(axis=0) == pytest.approx([0, 0, 0], abs=0.5)
    assert v.max(axis=0) == pytest.approx([60, 60, 30], abs=0.5)


def test_full_pipeline_writes_connectors_and_picogk(tmp_path):
    res = build(Project.load(EXAMPLE), tmp_path)
    cs = (tmp_path / "picogk" / "Program.cs").read_text()
    assert "class GyroidBlock" in cs and "Library.Go(" in cs and 'BuildFromStl("P1"' in cs
    for f in res.connector_files:
        assert (tmp_path / "connectors" / f).stat().st_size > 0
    compile((tmp_path / "connectors/freecad/ImportProject.FCMacro").read_text(), "macro", "exec")
    compile((tmp_path / "connectors/fusion360/EngineeringAIImport/EngineeringAIImport.py").read_text(),
            "fusion", "exec")
    assert "LatticeBlock" in cs and res.summary()["critical_path"]


def test_web_build_endpoint(tmp_path, monkeypatch):
    from engineering_ai import web
    monkeypatch.setattr(web, "RUNS", tmp_path)
    c = web.app.test_client()
    spec = c.get("/api/example").get_json()
    r = c.post("/api/build", json={"spec": spec, "start": "2026-11-23"})
    assert r.status_code == 200, r.get_json()
    data = r.get_json()
    assert data["duration_days"] == 22 and len(data["parts"]) == 7
    assert c.get(f"/runs/{data['run_id']}/bundle/picogk.zip").status_code == 200
    bad = c.post("/api/build", json={"spec": {"name": "x", "tasks": [
        {"id": "A", "name": "A", "duration_days": 1, "depends_on": ["A"]}]}})
    assert bad.status_code == 400
