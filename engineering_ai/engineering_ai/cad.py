"""Parametric part generators and CAD exporters.

Every part is exported as:
  * .dxf  - 2D drawing (ezdxf), opens in AutoCAD, Fusion, SolidWorks, FreeCAD, Onshape
  * .scad - editable parametric OpenSCAD source (no dependencies)
  * .step / .stl - 3D solids, when CadQuery is installed (pip install cadquery)
"""
from __future__ import annotations

import math
from pathlib import Path

import ezdxf

from .spec import Part

try:
    import cadquery as cq
except ImportError:  # 3D export is optional
    cq = None

# Defaults so a spec only needs the dimensions it cares about.
DEFAULTS: dict[str, dict[str, float]] = {
    "plate": dict(width=100, length=150, thickness=6, hole_diameter=8, hole_margin=12),
    "bracket": dict(width=40, leg_a=60, leg_b=50, thickness=5, hole_diameter=6),
    "shaft": dict(diameter=20, length=200, step_diameter=0, step_length=0),
    "flange": dict(outer_diameter=150, inner_diameter=60, thickness=12,
                   bolt_circle_diameter=115, bolt_count=6, bolt_hole_diameter=11),
    "enclosure": dict(width=120, length=180, height=60, wall=3),
}


def resolved_params(part: Part) -> dict[str, float]:
    p = {**DEFAULTS[part.type], **part.params}
    _check(part, p)
    return p


def _check(part: Part, p: dict[str, float]) -> None:
    def need(cond: bool, msg: str):
        if not cond:
            raise ValueError(f"part {part.id} ({part.type}): {msg}")
    for k, v in p.items():
        need(v >= 0, f"{k} must be >= 0")
    if part.type == "plate":
        need(p["hole_diameter"] == 0 or 2 * p["hole_margin"] < min(p["width"], p["length"]),
             "hole_margin too large for plate")
    elif part.type == "flange":
        need(p["inner_diameter"] < p["outer_diameter"], "inner_diameter must be < outer_diameter")
        need(p["bolt_count"] == 0 or
             p["inner_diameter"] < p["bolt_circle_diameter"] - p["bolt_hole_diameter"] and
             p["bolt_circle_diameter"] + p["bolt_hole_diameter"] < p["outer_diameter"],
             "bolt holes must sit between inner and outer diameter")
    elif part.type == "enclosure":
        need(2 * p["wall"] < min(p["width"], p["length"]) and p["wall"] < p["height"],
             "wall too thick")
    elif part.type == "bracket":
        need(p["thickness"] < min(p["leg_a"], p["leg_b"]), "thickness must be < leg lengths")


def _plate_holes(p):
    if not p["hole_diameter"]:
        return []
    m = p["hole_margin"]
    return [(m, m), (p["width"] - m, m), (m, p["length"] - m), (p["width"] - m, p["length"] - m)]


def _bolt_holes(p):
    n = int(p["bolt_count"])
    r = p["bolt_circle_diameter"] / 2
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]


# ------------------------------------------------------------------- DXF
def write_dxf(part: Part, path: Path) -> None:
    p = resolved_params(part)
    doc = ezdxf.new("R2010", setup=True)
    doc.units = ezdxf.units.MM
    doc.layers.add("OUTLINE", color=7)
    doc.layers.add("HOLES", color=1)
    doc.layers.add("CENTER", color=3, linetype="CENTER")
    msp = doc.modelspace()
    ol, hl = {"layer": "OUTLINE"}, {"layer": "HOLES"}

    if part.type == "plate":                      # top view
        w, l = p["width"], p["length"]
        msp.add_lwpolyline([(0, 0), (w, 0), (w, l), (0, l)], close=True, dxfattribs=ol)
        for c in _plate_holes(p):
            msp.add_circle(c, p["hole_diameter"] / 2, dxfattribs=hl)
        msp.add_linear_dim(base=(0, -15), p1=(0, 0), p2=(w, 0)).render()
        msp.add_linear_dim(base=(-15, 0), p1=(0, 0), p2=(0, l), angle=90).render()
    elif part.type == "bracket":                  # side profile (L)
        a, b, t = p["leg_a"], p["leg_b"], p["thickness"]
        msp.add_lwpolyline([(0, 0), (b, 0), (b, t), (t, t), (t, a), (0, a)], close=True, dxfattribs=ol)
        msp.add_linear_dim(base=(0, -15), p1=(0, 0), p2=(b, 0)).render()
        msp.add_linear_dim(base=(-15, 0), p1=(0, 0), p2=(0, a), angle=90).render()
    elif part.type == "shaft":                    # side profile
        d, L = p["diameter"], p["length"]
        sd, sl = p["step_diameter"], p["step_length"]
        if sd and sl:
            pts = [(0, -sd / 2), (sl, -sd / 2), (sl, -d / 2), (L, -d / 2),
                   (L, d / 2), (sl, d / 2), (sl, sd / 2), (0, sd / 2)]
        else:
            pts = [(0, -d / 2), (L, -d / 2), (L, d / 2), (0, d / 2)]
        msp.add_lwpolyline(pts, close=True, dxfattribs=ol)
        msp.add_line((-5, 0), (L + 5, 0), dxfattribs={"layer": "CENTER"})
        msp.add_linear_dim(base=(0, -d / 2 - 15), p1=(0, -d / 2), p2=(L, -d / 2)).render()
    elif part.type == "flange":                   # top view
        msp.add_circle((0, 0), p["outer_diameter"] / 2, dxfattribs=ol)
        msp.add_circle((0, 0), p["inner_diameter"] / 2, dxfattribs=ol)
        msp.add_circle((0, 0), p["bolt_circle_diameter"] / 2, dxfattribs={"layer": "CENTER"})
        for c in _bolt_holes(p):
            msp.add_circle(c, p["bolt_hole_diameter"] / 2, dxfattribs=hl)
        msp.add_diameter_dim(center=(0, 0), radius=p["outer_diameter"] / 2, angle=45).render()
    elif part.type == "enclosure":                # top view
        w, l, wall = p["width"], p["length"], p["wall"]
        msp.add_lwpolyline([(0, 0), (w, 0), (w, l), (0, l)], close=True, dxfattribs=ol)
        msp.add_lwpolyline([(wall, wall), (w - wall, wall), (w - wall, l - wall), (wall, l - wall)],
                           close=True, dxfattribs=ol)
        msp.add_linear_dim(base=(0, -15), p1=(0, 0), p2=(w, 0)).render()
        msp.add_linear_dim(base=(-15, 0), p1=(0, 0), p2=(0, l), angle=90).render()

    msp.add_text(f"{part.name} | {part.material} | qty {part.quantity}",
                 height=4, dxfattribs={"layer": "OUTLINE"}).set_placement((0, -35))
    doc.saveas(path)


# ---------------------------------------------------------------- OpenSCAD
def write_scad(part: Part, path: Path) -> None:
    p = resolved_params(part)
    head = [f"// {part.name} ({part.type}) - generated by engineering_ai", "$fn = 64;"]
    head += [f"{k} = {v:g};" for k, v in p.items()]
    if part.type == "plate":
        body = """difference() {
  cube([width, length, thickness]);
  if (hole_diameter > 0)
    for (x = [hole_margin, width - hole_margin], y = [hole_margin, length - hole_margin])
      translate([x, y, -1]) cylinder(d = hole_diameter, h = thickness + 2);
}"""
    elif part.type == "bracket":
        body = """difference() {
  union() {
    cube([leg_b, width, thickness]);
    cube([thickness, width, leg_a]);
  }
  if (hole_diameter > 0) {
    translate([(leg_b + thickness) / 2, width / 2, -1]) cylinder(d = hole_diameter, h = thickness + 2);
    translate([-1, width / 2, (leg_a + thickness) / 2]) rotate([0, 90, 0]) cylinder(d = hole_diameter, h = thickness + 2);
  }
}"""
    elif part.type == "shaft":
        body = """rotate([0, 90, 0]) {
  if (step_diameter > 0 && step_length > 0) {
    cylinder(d = step_diameter, h = step_length);
    translate([0, 0, step_length]) cylinder(d = diameter, h = length - step_length);
  } else cylinder(d = diameter, h = length);
}"""
    elif part.type == "flange":
        body = """difference() {
  cylinder(d = outer_diameter, h = thickness);
  translate([0, 0, -1]) cylinder(d = inner_diameter, h = thickness + 2);
  for (i = [0 : bolt_count - 1])
    rotate([0, 0, i * 360 / bolt_count]) translate([bolt_circle_diameter / 2, 0, -1])
      cylinder(d = bolt_hole_diameter, h = thickness + 2);
}"""
    else:  # enclosure: open-top box
        body = """difference() {
  cube([width, length, height]);
  translate([wall, wall, wall]) cube([width - 2 * wall, length - 2 * wall, height]);
}"""
    path.write_text("\n".join(head) + "\n\n" + body + "\n")


# --------------------------------------------------------- CadQuery 3D solid
def build_solid(part: Part):
    if cq is None:
        raise RuntimeError("CadQuery not installed")
    p = resolved_params(part)
    if part.type == "plate":
        s = cq.Workplane("XY").box(p["width"], p["length"], p["thickness"], centered=False)
        if p["hole_diameter"]:
            s = s.faces(">Z").workplane(origin=(0, 0, 0)).pushPoints(_plate_holes(p)).hole(p["hole_diameter"])
        return s
    if part.type == "bracket":
        a, b, t, w = p["leg_a"], p["leg_b"], p["thickness"], p["width"]
        s = (cq.Workplane("XZ").polyline([(0, 0), (b, 0), (b, t), (t, t), (t, a), (0, a)])
             .close().extrude(-w))
        if p["hole_diameter"]:
            r = p["hole_diameter"] / 2
            s = s.cut(cq.Workplane("XY").center((b + t) / 2, w / 2).circle(r).extrude(t))
            s = s.cut(cq.Workplane("YZ").center(w / 2, (a + t) / 2).circle(r).extrude(t))
        return s
    if part.type == "shaft":
        d, L, sd, sl = p["diameter"], p["length"], p["step_diameter"], p["step_length"]
        if sd and sl:
            s = cq.Workplane("YZ").circle(sd / 2).extrude(sl)
            return s.union(cq.Workplane("YZ").workplane(offset=sl).circle(d / 2).extrude(L - sl))
        return cq.Workplane("YZ").circle(d / 2).extrude(L)
    if part.type == "flange":
        s = (cq.Workplane("XY").circle(p["outer_diameter"] / 2)
             .circle(p["inner_diameter"] / 2).extrude(p["thickness"]))
        if p["bolt_count"]:
            s = s.faces(">Z").workplane(origin=(0, 0, 0)).pushPoints(_bolt_holes(p)).hole(p["bolt_hole_diameter"])
        return s
    w, l, h, wall = p["width"], p["length"], p["height"], p["wall"]
    return (cq.Workplane("XY").box(w, l, h, centered=False)
            .faces(">Z").shell(-wall))


# ------------------------------------------------------------------ driver
def export_part(part: Part, out_dir: Path, formats=("dxf", "scad", "step", "stl")) -> list[str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    if "dxf" in formats:
        write_dxf(part, out_dir / f"{part.id}.dxf"); written.append(f"{part.id}.dxf")
    if "scad" in formats:
        write_scad(part, out_dir / f"{part.id}.scad"); written.append(f"{part.id}.scad")
    if cq is not None and ({"step", "stl"} & set(formats)):
        solid = build_solid(part)
        if "step" in formats:
            cq.exporters.export(solid, str(out_dir / f"{part.id}.step")); written.append(f"{part.id}.step")
        if "stl" in formats:
            cq.exporters.export(solid, str(out_dir / f"{part.id}.stl")); written.append(f"{part.id}.stl")
    return written
