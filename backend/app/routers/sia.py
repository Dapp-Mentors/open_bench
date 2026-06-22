"""
app/routers/sia.py

Sia connection-status endpoint used by the NavBar to show whether the app
is connected to the Sia indexer, running in demo mode, or offline.
Also provides step-by-step registration endpoints called by the setup wizard
so the entire Sia approval flow happens from the frontend without a restart.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services import sia_client


class RecoveryPhraseRequest(BaseModel):
    recovery_phrase: str

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


@router.post("/register/init")
async def sia_register_init(body: RecoveryPhraseRequest):
    """
    Step 1 of the frontend-driven Sia registration flow.

    Accepts the user's BIP-39 recovery phrase, reads the Sia config from
    the AppSettings table (set via the setup wizard), creates the SDK Builder,
    calls request_connection(), and returns the approval URL that the user
    must open in their browser to authorize the app.

    The recovery phrase is held in memory ONLY during this flow and is
    NEVER stored by the application.

    Returns:
      { "ok": true, "approval_url": "https://..." }
      { "ok": true, "already_connected": true }
      { "ok": false, "error": "..." }
    """
    return await sia_client.registration_start(body.recovery_phrase)


@router.post("/register/check")
async def sia_register_check():
    """
    Step 2 of the frontend-driven Sia registration flow.

    Checks whether the user has approved the app on the Sia indexer.
    If approved, completes the SDK registration and saves the app key.

    The frontend should poll this endpoint after opening the approval URL.

    Returns:
      { "ok": true, "status": "approved" }
      { "ok": true, "status": "pending" }
      { "ok": false, "error": "..." }
    """
    return await sia_client.registration_check()