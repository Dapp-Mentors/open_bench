"""
app/services/sia.py
-------------------
Public upload API used by the pipeline approve endpoint.

Depends on sia_client.py for the SDK singleton — don't call Builder or
AppKey directly from here.
"""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from sia_storage import PinnedObject

from app.services.sia_client import get_sdk

# ── Constants ──────────────────────────────────────────────────────────────────

DEMO_PREFIX = "demo-sia-"


# ── Helpers ────────────────────────────────────────────────────────────────────

def _read_data(storage_path: str) -> tuple[bytes, str]:
    """Read data from storage_path (ZIP or directory) and return (data, filename)."""
    path = Path(storage_path)
    if not path.exists():
        raise FileNotFoundError(f"storage_path does not exist: {storage_path}")

    if path.is_file():
        data = path.read_bytes()
        file_name = path.name
    else:
        # Directory — zip it up in memory before uploading
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in sorted(path.rglob("*")):
                if f.is_file():
                    zf.write(f, f.relative_to(path))
        data = buf.getvalue()
        file_name = f"{path.name}.zip"

    return data, file_name


# ── Full pipeline: each step updates siaStatus via the callback ────────────────

async def upload_task(
    task_id: str,
    storage_path: str,
    extra_meta: dict | None = None,
    on_status: callable | None = None,
) -> str:
    """
    Upload a task ZIP to Sia and pin it.

    Calls *on_status(step)* at each stage so the caller can persist the
    intermediate siaStatus for real-time frontend visibility.

    Steps reported: "uploading" → "pinning" → "ready"

    Returns the Sia object ID.
    """
    sdk = await get_sdk()

    # ── Demo mode ──────────────────────────────────────────────────────────────
    if sdk is None:
        print(f"[Sia][demo] skipping upload for task {task_id}")
        return f"{DEMO_PREFIX}{task_id}"

    # ── Read data ──────────────────────────────────────────────────────────────
    data, file_name = _read_data(storage_path)
    print(f"[Sia] uploading {file_name} ({len(data):,} bytes) for task {task_id}")

    # ── Step: uploading ────────────────────────────────────────────────────────
    if on_status:
        await on_status("uploading")

    pinned_obj = PinnedObject()
    uploaded_obj = await sdk.upload(pinned_obj, data)

    object_id: str = uploaded_obj.id()
    if not object_id:
        raise RuntimeError("sdk.upload() returned an object with no ID")

    print(f"[Sia] upload complete, objectId={object_id}")

    # ── Attach metadata ────────────────────────────────────────────────────────
    metadata: dict = {
        "taskId": task_id,
        "fileName": file_name,
        "sizeBytes": len(data),
    }
    if extra_meta:
        metadata.update(extra_meta)

    uploaded_obj.update_metadata(json.dumps(metadata).encode())

    # ── Step: pinning ──────────────────────────────────────────────────────────
    if on_status:
        await on_status("pinning")

    await sdk.pin_object(uploaded_obj)
    print(f"[Sia] pinned objectId={object_id}")

    return object_id