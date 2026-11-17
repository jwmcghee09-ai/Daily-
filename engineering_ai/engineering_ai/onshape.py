"""Upload generated CAD files into an Onshape document.

Uses Onshape API keys (create them at https://dev-portal.onshape.com) via
environment variables ONSHAPE_ACCESS_KEY / ONSHAPE_SECRET_KEY.
The file is imported as a blob element and translated (STEP -> Part Studio).
"""
from __future__ import annotations

import os
from pathlib import Path

BASE = os.environ.get("ONSHAPE_BASE_URL", "https://cad.onshape.com")


def upload(path: str | Path, document_id: str, workspace_id: str, translate: bool = True) -> dict:
    import requests

    access, secret = os.environ.get("ONSHAPE_ACCESS_KEY"), os.environ.get("ONSHAPE_SECRET_KEY")
    if not (access and secret):
        raise RuntimeError("Set ONSHAPE_ACCESS_KEY and ONSHAPE_SECRET_KEY")
    path = Path(path)
    url = f"{BASE}/api/v6/blobelements/d/{document_id}/w/{workspace_id}"
    with path.open("rb") as fh:
        resp = requests.post(
            url,
            auth=(access, secret),
            files={"file": (path.name, fh, "application/octet-stream")},
            data={"encodedFilename": path.name, "translate": str(translate).lower(),
                  "flattenAssemblies": "false", "storeInDocument": "true"},
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()
