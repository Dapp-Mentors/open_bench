"""
app/services/sia_client.py
--------------------------
Sia SDK singleton — mirrors the pattern from the working JS client.ts.

Auth flow (automatic, no manual steps):
  1. On first boot, looks for a persisted app key at SIA_KEY_PATH.
  2. If found, tries builder.connected(). If the indexer accepts it, done.
  3. If the key is missing or rejected: loads/generates a recovery phrase
     (persisted at SIA_PHRASE_PATH), runs the full registration flow, and
     prints the approval URL to stdout. Server stays alive while waiting.
  4. On success the derived key is saved to SIA_KEY_PATH — next boot is fast.

SIA_MODE=demo skips all of the above and returns None from get_sdk().
Every caller must handle None gracefully (demo/dry-run behaviour).

Env vars:
  SIA_INDEXER_URL      default: https://sia.storage
  SIA_APP_ID           64-char hex (32 bytes). Generate once:
                         python -c "import os; print(os.urandom(32).hex())"
  SIA_APP_NAME         default: OpenBench
  SIA_APP_SERVICE_URL  default: http://localhost:8000
  SIA_KEY_PATH         where to persist the app key (default: ./data/appkey.hex)
  SIA_PHRASE_PATH      where to persist the recovery phrase (default: ./data/phrase.enc)
  SIA_MODE             "auto" (default) or "demo"
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from sia_storage import (
    AppKey,
    AppMetadata,
    Builder,
    generate_recovery_phrase,
    validate_recovery_phrase,
)
from sia_storage import Sdk  # type: ignore[attr-defined]  # re-exported

# ── Env config ─────────────────────────────────────────────────────────────────

_INDEXER_URL  = os.getenv("SIA_INDEXER_URL",     "https://sia.storage")
_APP_ID_HEX   = os.getenv("SIA_APP_ID",          "6f70656e6275636b657400000000000000000000000000000000000000000000")
_APP_NAME     = os.getenv("SIA_APP_NAME",         "OpenBench")
_APP_SVC_URL  = os.getenv("SIA_APP_SERVICE_URL",  "http://localhost:8000")
_SIA_MODE     = os.getenv("SIA_MODE",             "auto").lower()
_KEY_PATH     = Path(os.getenv("SIA_KEY_PATH",    "./data/appkey.hex"))
_PHRASE_PATH  = Path(os.getenv("SIA_PHRASE_PATH", "./data/phrase.enc"))

# ── Module state ────────────────────────────────────────────────────────────────

_sdk: Sdk | None = None
_demo_mode: bool = False
_demo_reason: str = ""
_init_task: asyncio.Task | None = None   # guards against concurrent init
_init_lock = asyncio.Lock()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_app_id() -> bytes:
    hex_str = _APP_ID_HEX.strip()
    if len(hex_str) != 64:
        raise ValueError(
            f"SIA_APP_ID must be a 64-character hex string (32 bytes). Got {len(hex_str)} chars."
        )
    return bytes.fromhex(hex_str)


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


def _load_or_generate_phrase() -> str:
    if _PHRASE_PATH.exists():
        phrase = _PHRASE_PATH.read_text().strip()
        print(f"[Sia] Loaded recovery phrase from {_PHRASE_PATH}")
        return phrase
    phrase = generate_recovery_phrase()
    validate_recovery_phrase(phrase)
    _PHRASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _PHRASE_PATH.write_text(phrase)
    print(f"[Sia] Generated and saved new recovery phrase to {_PHRASE_PATH}")
    return phrase


# ── Core init ───────────────────────────────────────────────────────────────────

async def _init_sia_client() -> Sdk | None:
    global _demo_mode, _demo_reason

    if _SIA_MODE == "demo":
        _demo_mode = True
        _demo_reason = "SIA_MODE=demo"
        return None

    app_meta = AppMetadata(
        id=_parse_app_id(),
        name=_APP_NAME,
        description="Benchmark task curation pipeline",
        service_url=_APP_SVC_URL,
        logo_url=None,
        callback_url=None,
    )

    builder = Builder(_INDEXER_URL, app_meta)

    # 1. Try stored key first (fast path — no user interaction)
    stored_key = _load_stored_key()
    if stored_key:
        print("[Sia] Attempting connection with stored app key…")
        sdk = await builder.connected(stored_key)
        if sdk is not None:
            print("[Sia] Connected with stored app key.")
            return sdk
        print("[Sia] Stored key rejected by indexer — re-registering…")

    # 2. Full registration flow
    print("[Sia] Starting registration flow…")
    phrase = _load_or_generate_phrase()

    try:
        await builder.request_connection()
        approval_url = builder.response_url()
        print("")
        print("╔══════════════════════════════════════════════════════════════╗")
        print("║              [Sia] ACTION REQUIRED                           ║")
        print("║  Open this URL to approve the app:                           ║")
        print(f"║  {approval_url:<60}  ║")
        print("╚══════════════════════════════════════════════════════════════╝")
        print("")
        print("[Sia] Waiting for approval…")
        await builder.wait_for_approval()
        print("[Sia] Approval received.")
    except Exception as exc:
        # Already approved on a previous run — register() will still work
        print(f"[Sia] request_connection/wait_for_approval skipped (likely already approved): {exc}")

    sdk = await builder.register(phrase)
    _save_key(sdk.app_key())
    print("[Sia] Registration complete — app key stored.")
    return sdk


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