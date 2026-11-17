# Engineering AI

Turns an engineering brief into a **project map** (dependency graph, critical-path schedule, Gantt chart)
and **CAD files** for every part, ready to import into your CAD tool or upload straight to Onshape.

```
brief ──(Claude)──► project spec (JSON) ──► CPM planner ──► report.md (schedule, Mermaid diagrams, BOM)
                                      └──► parametric CAD ──► .step .stl .dxf .scad ──► Onshape upload
```

## Install

```bash
pip install -r requirements.txt
pip install cadquery          # optional, for 3D STEP/STL export
```

## Use

From a plain-English brief (needs an Anthropic API key in `ANTHROPIC_API_KEY`):

```bash
python -m engineering_ai design "Design a wall-mounted hoist bracket for a 250 kg load, steel, bolted to concrete" -o out/
```

From a spec you wrote or edited yourself (no API key needed):

```bash
python -m engineering_ai build examples/conveyor.json -o out/
```

Upload a part to an Onshape document. You need API keys from dev-portal.onshape.com, set as `ONSHAPE_ACCESS_KEY` and `ONSHAPE_SECRET_KEY`:

```bash
python -m engineering_ai upload out/parts/P1.step --document <doc id> --workspace <workspace id>
```

The document and workspace IDs are in the Onshape URL: `cad.onshape.com/documents/<doc id>/w/<workspace id>/...`.

## Output

| File | What it is |
|---|---|
| `out/report.md` | CPM table (ES/EF/LS/LF/slack), critical path, Mermaid dependency map and Gantt, parts list |
| `out/project.json` | The spec. Edit the dimensions or tasks here and re-run `build` |
| `out/parts/*.step` | 3D solids for SolidWorks, Fusion 360, Inventor, FreeCAD and Onshape |
| `out/parts/*.stl` | Meshes for 3D printing and viewers |
| `out/parts/*.dxf` | 2D drawings with dimensions for AutoCAD, laser cutting and CNC |
| `out/parts/*.scad` | Editable parametric OpenSCAD source |

## Algorithms

- **Kahn's topological sort** orders tasks and rejects dependency cycles.
- **Critical Path Method**: the forward pass gives the earliest start and finish of each task, the backward pass gives the latest. Slack is LS − ES, and tasks with zero slack form the critical path.
- **Parametric solid modelling** (CadQuery/OpenCascade): each part type is a function from its dimensions to a solid. Parameter checks run first, so impossible geometry is rejected (for example, bolt holes outside a flange).

## Part library

`plate`, `bracket` (L-angle), `shaft` (optionally stepped), `flange` (bolt circle), `enclosure` (open-top box).
Defaults and parameter names are in `engineering_ai/cad.py` (`DEFAULTS`). To add a type, add it to
`DEFAULTS` and write its `write_dxf`, `write_scad` and `build_solid` branches.

## Limits

The AI picks dimensions that look reasonable, but it does not run stress analysis.
Have a qualified engineer check loads, safety factors and standards before anything is manufactured.

## Tests

```bash
python -m pytest -q
```
