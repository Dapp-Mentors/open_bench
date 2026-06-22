"""
app/services/sia_client.py
--------------------------
Sia SDK singleton — mirrors the pattern from the working JS client.ts.

Auth flow (automatic, no manual steps):
  1. On first boot, looks for a persisted app key at SIA_KEY_PATH.
  2. If found, tries builder.connected(). If the indexer accepts it, done.
  3. If the key is missing or rejected: runs the full registration flow
     using the user's BIP-39 recovery phrase (provided via the setup wizard).
  4. On success the derived key is saved to SIA_KEY_PATH — next boot is fast.

⚠️ The BIP-39 recovery phrase is the user's master key.
   It must NEVER be stored by the application. The user provides it once
   during onboarding to derive the App Key. Only the App Key is persisted.

SIA_MODE=demo skips all of the above and returns None from get_sdk().
Every caller must handle None gracefully (demo/dry-run behaviour).

All Sia config values (indexer URL, app ID, app name) are read from the
AppSettings table via the settings singleton (set through the setup wizard).
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from sia_storage import (
    AppKey,
    AppMetadata,
    Builder,
    validate_recovery_phrase,
)
from sia_storage import Sdk  # type: ignore[attr-defined]  # re-exported
from app.core.config import settings

# ── Config (from DB via settings singleton) ─────────────────────────────────────

_SIA_MODE     = os.getenv("SIA_MODE",             "auto").lower()
_KEY_PATH     = Path(os.getenv("SIA_KEY_PATH",    "./data/appkey.hex"))
_APP_SVC_URL  = os.getenv("SIA_APP_SERVICE_URL",  "http://localhost:8000")

# ── Module state ────────────────────────────────────────────────────────────────

_sdk: Sdk | None = None
_demo_mode: bool = False
_demo_reason: str = ""
_init_task: asyncio.Task | None = None   # guards against concurrent init
_init_lock = asyncio.Lock()

# Ephemeral builder state for the step-by-step registration flow
# (triggered from the frontend, not from startup).
# The recovery phrase is held in memory ONLY during the registration flow
# and is discarded as soon as register() completes or fails.
_registration_flow: dict = {
    "builder": None,        # Builder | None
    "phrase": None,         # str | None — NEVER persisted, discarded after use
    "approval_url": None,   # str | None
    "step": "idle",         # idle | pending_approval | completed | failed
    "error": None,          # str | None
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_app_id() -> bytes:
    hex_str = settings.sia_app_id()
    if not hex_str or len(hex_str.strip()) != 64:
        raise ValueError(
            f"SIA_APP_ID must be a 64-character hex string (32 bytes). "
            f"Got {len(hex_str.strip()) if hex_str else 0} chars. "
            f"Set it via the setup wizard."
        )
    return bytes.fromhex(hex_str.strip())


def _load_stored_key() -> AppKey | None:
    try:
        if not _KEY_PATH.exists():
            return None
        hex_str = _KEY_PATH.read_text().strip()
        print(f"[Sia] Loading stored app key from {_KEY_PATH}")
        return AppKey(bytes.fromhex(hex_str))
    except Exception as exc:
        print(f"[Sia] Could not load stored key: {exc}")
        return None


def _save_key(key: AppKey) -> None:
    _KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    _KEY_PATH.write_text(bytes(key.export()).hex())
    print(f"[Sia] App key saved to {_KEY_PATH}")


# ── Step-by-step registration (called from the frontend) ────────────────────────

async def registration_start(recovery_phrase: str) -> dict:
    """
    Step 1: Start the Sia registration flow using the user's BIP-39
    recovery phrase.

    The recovery phrase is provided by the user via the setup wizard.
    It is used ONLY during this flow and is NEVER stored by the application.
    After registration completes, only the derived App Key is persisted.

    Refreshes settings from DB, creates the Builder, calls request_connection(),
    and returns the approval URL that the user must visit to approve the app.

    Returns: { "ok": true, "approval_url": "https://..." }
             { "ok": false, "error": "..." }
    """
    global _registration_flow

    if _SIA_MODE == "demo":
        return {"ok": False, "error": "Sia is in demo mode — registration not available"}

    # Validate the recovery phrase before proceeding
    try:
        validate_recovery_phrase(recovery_phrase)
    except Exception as e:
        return {"ok": False, "error": f"Invalid recovery phrase: {e}"}

    # Refresh settings from DB so latest config is used
    await settings.load_db_settings()

    try:
        app_meta = AppMetadata(
            id=_parse_app_id(),
            name=settings.sia_app_name(),
            description=settings.sia_app_description() or "Benchmark task curation pipeline",
            service_url=_APP_SVC_URL,
            logo_url=None,
            callback_url=None,
        )
    except ValueError as e:
        _registration_flow = {"builder": None, "phrase": None, "approval_url": None, "step": "failed", "error": str(e)}
        return {"ok": False, "error": str(e)}

    builder = Builder(settings.sia_indexer_url(), app_meta)

    # Note: We intentionally do NOT try the stored key here during explicit
    # registration. The stored key check happens at startup (in _init_sia_client).
    # When the user clicks "Start Sia registration" in the setup wizard, they
    # expect to see the approval URL flow. If a stored key exists and is valid,
    # the next startup will pick it up automatically. This also prevents the
    # frontend from silently marking Sia as "connected" without user interaction.

    # Full registration flow using the user's recovery phrase
    try:
        print("[Sia] Requesting connection…")
        await builder.request_connection()
        approval_url = builder.response_url()
        print(f"[Sia] Approval URL: {approval_url}")

        _registration_flow = {
            "builder": builder,
            "phrase": recovery_phrase,  # held in memory only during this flow
            "approval_url": str(approval_url),
            "step": "pending_approval",
            "error": None,
        }

        return {"ok": True, "approval_url": str(approval_url)}

    except Exception as exc:
        _registration_flow = {"builder": None, "phrase": None, "approval_url": None, "step": "failed", "error": str(exc)}
        print(f"[Sia] Registration start failed: {exc}")
        return {"ok": False, "error": str(exc)}


async def registration_check() -> dict:
    """
    Step 2: Check if the user has approved the app on the Sia indexer.
    Calls wait_for_approval() with a short timeout. If approved, completes
    the registration using the user's recovery phrase and saves the App Key.

    The recovery phrase is discarded from memory after register() completes.

    The frontend should call this *after* the user opens the approval URL
    and approves on the Sia domain.

    Returns: { "ok": true, "status": "approved" }
             { "ok": true, "status": "pending" }
             { "ok": false, "error": "..." }
    """
    global _registration_flow, _sdk

    flow = _registration_flow

    if flow["step"] == "completed":
        return {"ok": True, "status": "approved"}

    if flow["step"] != "pending_approval" or flow["builder"] is None:
        return {"ok": False, "error": "No pending registration — call /api/sia/register/init first"}

    builder: Builder = flow["builder"]
    phrase: str = flow["phrase"]

    try:
        # Try to wait for approval (short timeout so the frontend doesn't hang)
        await builder.wait_for_approval()
        print("[Sia] Approval received — completing registration…")
        sdk = await builder.register(phrase)
        _save_key(sdk.app_key())
        _sdk = sdk
        # Discard the recovery phrase from memory
        _registration_flow = {"builder": None, "phrase": None, "approval_url": flow["approval_url"], "step": "completed", "error": None}
        print("[Sia] Registration complete — app key stored. Recovery phrase discarded.")
        return {"ok": True, "status": "approved"}
    except Exception as exc:
        err_str = str(exc)
        # If the timeout exception is just "still pending", return pending
        if "wait" in err_str.lower() or "timeout" in err_str.lower() or "pending" in err_str.lower():
            return {"ok": True, "status": "pending"}
        print(f"[Sia] Registration check failed: {exc}")
        _registration_flow["step"] = "failed"
        _registration_flow["error"] = err_str
        # Discard the recovery phrase on failure too
        _registration_flow["phrase"] = None
        return {"ok": False, "error": err_str}


def reset_registration_flow() -> None:
    """Reset the registration flow state and discard any held phrase."""
    global _registration_flow
    _registration_flow = {
        "builder": None,
        "phrase": None,
        "approval_url": None,
        "step": "idle",
        "error": None,
    }


# ── Core init ───────────────────────────────────────────────────────────────────

async def _init_sia_client() -> Sdk | None:
    global _demo_mode, _demo_reason

    if _SIA_MODE == "demo":
        _demo_mode = True
        _demo_reason = "SIA_MODE=demo"
        return None

    app_meta = AppMetadata(
        id=_parse_app_id(),
        name=settings.sia_app_name(),
        description=settings.sia_app_description() or "Benchmark task curation pipeline",
        service_url=_APP_SVC_URL,
        logo_url=None,
        callback_url=None,
    )

    builder = Builder(settings.sia_indexer_url(), app_meta)

    # 1. Try stored key first (fast path — no user interaction)
    stored_key = _load_stored_key()
    if stored_key:
        print("[Sia] Attempting connection with stored app key…")
        sdk = await builder.connected(stored_key)
        if sdk is not None:
            print("[Sia] Connected with stored app key.")
            return sdk
        print("[Sia] Stored key rejected by indexer — registration required.")

    # 2. No stored key or rejected — registration must be done via the
    #    setup wizard. The server will run in demo mode until then.
    print("[Sia] No valid app key found. Run the setup wizard to register.")
    _demo_mode = True
    _demo_reason = "Sia not configured — use the setup wizard"
    return None


# ── Public API ──────────────────────────────────────────────────────────────────

def is_demo_mode() -> bool:
    return _demo_mode


def get_demo_reason() -> str:
    return _demo_reason


async def get_sdk() -> Sdk | None:
    """
    Returns the live Sdk instance, or None in demo mode.
    Safe to call concurrently — init only runs once.
    """
    global _sdk, _demo_mode, _demo_reason

    if _sdk is not None:
        return _sdk
    if _demo_mode:
        return None

    async with _init_lock:
        # Re-check after acquiring lock (another coroutine may have finished)
        if _sdk is not None:
            return _sdk
        if _demo_mode:
            return None

        try:
            sdk = await _init_sia_client()
            _sdk = sdk
            if sdk is None and not _demo_mode:
                _demo_mode = True
                _demo_reason = "Sia connection unavailable"
            return sdk
        except Exception as exc:
            print(f"[Sia] Init failed: {exc}")
            _demo_mode = True
            _demo_reason = str(exc)
            return None