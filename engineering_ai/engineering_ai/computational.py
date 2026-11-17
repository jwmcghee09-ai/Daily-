"""Computational-engineering parts (the Noyron / PicoGK style).

Instead of sketch-and-extrude, these parts are *implicit* fields: a signed
distance function (SDF) that is negative inside the material. This makes
lattices, gyroid infills and other additive-manufacturing geometry easy.

This module evaluates the fields with NumPy and meshes them with marching
cubes, so it runs anywhere. The same fields are emitted as C# for LEAP 71's
PicoGK kernel by picogk.py, for full-resolution voxel modelling.
"""
from __future__ import annotations

import math
import struct
from pathlib import Path

import numpy as np

from .spec import Part

COMPUTATIONAL_DEFAULTS: dict[str, dict[str, float]] = {
    # Gyroid (TPMS) core between solid top/bottom plates: light, stiff, self-supporting,
    # open at the sides so coolant or air can flow through.
    "gyroid_block": dict(width=60, length=60, height=30, cell_size=12, wall=1.2, skin=1.5),
    # Body-centred-cubic strut lattice between two solid face plates.
    "lattice_block": dict(width=60, length=60, height=30, cell_size=15, strut_diameter=2.5, skin=2.0),
}

GYROID_GRAD = 1.25  # mean |grad| of the unit gyroid, turns the field into ~mm


def resolved_params(part: Part) -> dict[str, float]:
    p = {**COMPUTATIONAL_DEFAULTS[part.type], **part.params}
    for k, v in p.items():
        if v < 0:
            raise ValueError(f"part {part.id}: {k} must be >= 0")
    if 2 * p["skin"] >= p["height"]:
        raise ValueError(f"part {part.id}: skin too thick for the block")
    if p["cell_size"] <= 0:
        raise ValueError(f"part {part.id}: cell_size must be > 0")
    return p


# ------------------------------------------------------------- SDF pieces
def sdf_box(x, y, z, w, l, h):
    """Exact SDF of the box [0,w]x[0,l]x[0,h]."""
    q = np.stack([np.abs(x - w / 2) - w / 2, np.abs(y - l / 2) - l / 2, np.abs(z - h / 2) - h / 2])
    outside = np.linalg.norm(np.maximum(q, 0), axis=0)
    inside = np.minimum(q.max(axis=0), 0)
    return outside + inside


def sdf_gyroid(x, y, z, cell, wall):
    k = 2 * math.pi / cell
    g = np.sin(k * x) * np.cos(k * y) + np.sin(k * y) * np.cos(k * z) + np.sin(k * z) * np.cos(k * x)
    return np.abs(g) / (k * GYROID_GRAD) - wall / 2


def sdf_bcc(x, y, z, cell, radius):
    """Body-centred-cubic struts: the 4 body diagonals of every cell."""
    # local coordinates in [-cell/2, cell/2) around each cell centre
    p = np.stack([(c % cell) - cell / 2 for c in (x, y, z)])
    best = None
    for d in ((1, 1, 1), (1, 1, -1), (1, -1, 1), (-1, 1, 1)):
        d = np.array(d, float) / math.sqrt(3)
        t = np.tensordot(d, p, axes=1)
        dist = np.linalg.norm(p - t * d[:, None, None, None], axis=0)
        best = dist if best is None else np.minimum(best, dist)
    return best - radius


def field(part: Part, x, y, z):
    p = resolved_params(part)
    w, l, h, s = p["width"], p["length"], p["height"], p["skin"]
    box = sdf_box(x, y, z, w, l, h)
    # top/bottom plates: inside when z < s or z > h - s, i.e. min(z - s, h - s - z) < 0
    plates = np.maximum(box, np.minimum(z - s, (h - s) - z))
    if part.type == "gyroid_block":
        core = np.maximum(box, sdf_gyroid(x, y, z, p["cell_size"], p["wall"]))
        return np.minimum(plates, core)
    struts = np.maximum(box, sdf_bcc(x, y, z, p["cell_size"], p["strut_diameter"] / 2))
    return np.minimum(plates, struts)


# ------------------------------------------------------------- meshing
def mesh(part: Part, voxel: float | None = None, max_cells: int = 180):
    """Marching-cubes mesh of the part. Returns (vertices Nx3, faces Mx3)."""
    from skimage.measure import marching_cubes

    p = resolved_params(part)
    dims = np.array([p["width"], p["length"], p["height"]])
    feature = min(p.get("wall", 1e9), p.get("strut_diameter", 1e9), p["skin"])
    voxel = voxel or max(feature / 2, dims.max() / max_cells)
    pad = 2 * voxel
    axes = [np.arange(-pad, d + pad + voxel, voxel) for d in dims]
    x, y, z = np.meshgrid(*axes, indexing="ij")
    sdf = field(part, x, y, z).astype(np.float32)
    verts, faces, _, _ = marching_cubes(sdf, level=0.0, spacing=(voxel,) * 3)
    verts -= pad
    return verts, faces


def mesh_volume(verts, faces) -> float:
    a, b, c = verts[faces[:, 0]], verts[faces[:, 1]], verts[faces[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6)


def write_stl(verts, faces, path: Path, name: str = "part") -> None:
    tri = verts[faces].astype(np.float32)
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(faces), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    rec["n"], rec["v"] = n, tri
    with open(path, "wb") as fh:
        fh.write(name.encode()[:80].ljust(80, b"\0"))
        fh.write(struct.pack("<I", len(faces)))
        fh.write(rec.tobytes())


def export_part(part: Part, out_dir: Path) -> list[str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    verts, faces = mesh(part)
    write_stl(verts, faces, out_dir / f"{part.id}.stl", part.name)
    return [f"{part.id}.stl"]
