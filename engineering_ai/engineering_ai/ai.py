"""AI designer: turns a plain-English brief into a Project spec using Claude.

Needs the `anthropic` package and an API key (ANTHROPIC_API_KEY or `ant auth login`).
"""
from __future__ import annotations

import json

from .spec import PART_TYPES, Project
from .cad import DEFAULTS
from .computational import COMPUTATIONAL_DEFAULTS

MODEL = "claude-opus-5-5"

_PARAM = {"type": "object", "additionalProperties": False,
          "required": ["name", "value"],
          "properties": {"name": {"type": "string"}, "value": {"type": "number"}}}

SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["name", "description", "units", "parts", "tasks"],
    "properties": {
        "name": {"type": "string"},
        "description": {"type": "string"},
        "units": {"type": "string", "enum": ["mm"]},
        "parts": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["id", "name", "type", "params", "material", "quantity"],
            "properties": {
                "id": {"type": "string"}, "name": {"type": "string"},
                "type": {"type": "string", "enum": list(PART_TYPES)},
                "params": {"type": "array", "items": _PARAM},
                "material": {"type": "string"}, "quantity": {"type": "integer"},
            }}},
        "tasks": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["id", "name", "duration_days", "depends_on", "part_id"],
            "properties": {
                "id": {"type": "string"}, "name": {"type": "string"},
                "duration_days": {"type": "number"},
                "depends_on": {"type": "array", "items": {"type": "string"}},
                "part_id": {"type": "string", "description": "part this task produces, or empty"},
            }}},
    },
}

SYSTEM = f"""You are a senior mechanical engineer and project planner.
Turn the user's brief into a buildable project plan and a parts list.

Parts: use only these parametric part types, with these parameters (all mm):
{json.dumps(DEFAULTS, indent=1)}
Additive-manufacturing (3D-printed) parts, for lightweight or heat-exchange
needs; cell_size is the lattice period, wall/strut_diameter the feature size:
{json.dumps(COMPUTATIONAL_DEFAULTS, indent=1)}
Choose realistic dimensions for the stated loads and purpose; give every parameter
of each part you use. Use ids like "P1", "P2".

Tasks: cover the full lifecycle (requirements, design, analysis, procurement,
manufacture of each part, assembly, testing, documentation). Give realistic
durations in working days and dependencies by task id ("T1", "T2", ...).
Dependencies must form a DAG. Set part_id to the part a manufacturing task
produces, or "" otherwise.
Put engineering assumptions (loads, safety factors, standards) in the description."""


def design_project(brief: str, effort: str = "high") -> Project:
    import anthropic

    client = anthropic.Anthropic()
    with client.beta.messages.stream(
        model=MODEL,
        max_tokens=64000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM,
        output_config={"effort": effort,
                       "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": brief}],
    ) as stream:
        msg = stream.get_final_message()

    if msg.stop_reason == "refusal":
        raise RuntimeError(f"Model declined the request: {msg.stop_details}")
    if msg.stop_reason == "max_tokens":
        raise RuntimeError("Response was cut off (max_tokens); try a smaller brief.")
    text = next(b.text for b in msg.content if b.type == "text")
    return Project.from_dict(json.loads(text))
