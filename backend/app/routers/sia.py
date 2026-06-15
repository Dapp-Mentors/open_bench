"""
app/routers/sia.py

Sia connection-status endpoint used by the NavBar to show whether the app
is connected to the Sia indexer, running in demo mode, or offline.
"""

from fastapi import APIRouter

from app.services import sia_client

router = APIRouter()


@router.get("/status")
async def sia_status():
    """
    Return the current Sia connection state.

    Response shape:
      { "connected": bool, "mode": "live" | "demo", "reason": str | null }

    `connected`  — true when the SDK is initialised and usable.
    `mode`       — "demo" when SIA_MODE=demo or the connection has failed.
    `reason`     — human-readable explanation when not connected.
    """
    sdk = await sia_client.get_sdk()
    connected = sdk is not None

    if connected:
        return {"connected": True, "mode": "live", "reason": None}

    if sia_client.is_demo_mode():
        return {"connected": False, "mode": "demo", "reason": sia_client.get_demo_reason()}

    return {"connected": False, "mode": "live", "reason": "Sia client not initialised"}