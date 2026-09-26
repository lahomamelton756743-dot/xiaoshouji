import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel

try:
    from mi_fitness import MiHealthClient
except Exception:  # pragma: no cover - service can still expose /health for diagnosis
    MiHealthClient = None

APP_VERSION = "0.6.2"
TOKEN_FILE = Path(os.getenv("MI_FITNESS_TOKEN_FILE", "token.json"))
TARGET_UID = os.getenv("MI_FITNESS_TARGET_UID", "").strip()
LITTLE_PHONE_URL = os.getenv("LITTLE_PHONE_URL", "https://little-phone-backend.lahomamelton756743.workers.dev").rstrip("/")
LINJIAN_TOKEN = os.getenv("LINJIAN_TOKEN", "").strip()
BRIDGE_TOKEN = os.getenv("HEALTH_BRIDGE_TOKEN", "").strip()

app = FastAPI(title="Little Phone Xiaomi Health Bridge", version=APP_VERSION)


def require_bridge_token(x_bridge_token: str | None) -> None:
    if BRIDGE_TOKEN and x_bridge_token != BRIDGE_TOKEN:
        raise HTTPException(status_code=403, detail="bad_bridge_token")


def jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    if hasattr(value, "model_dump"):
        return jsonable(value.model_dump())
    if hasattr(value, "dict"):
        try:
            return jsonable(value.dict())
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        return {k: jsonable(v) for k, v in vars(value).items() if not str(k).startswith("_")}
    return str(value)


def find_value(obj: Any, names: tuple[str, ...]) -> Any:
    """Find a value by key name without assuming one SDK response shape."""
    if isinstance(obj, dict):
        lowered = {str(k).lower(): v for k, v in obj.items()}
        for name in names:
            if name.lower() in lowered and lowered[name.lower()] not in (None, ""):
                return lowered[name.lower()]
        for v in obj.values():
            hit = find_value(v, names)
            if hit not in (None, ""):
                return hit
    elif isinstance(obj, list):
        for v in obj:
            hit = find_value(v, names)
            if hit not in (None, ""):
                return hit
    return None


def summarize_sleep(raw: Any) -> dict[str, Any]:
    d = jsonable(raw)
    out = {
        "total_minutes": find_value(d, ("total_minutes", "duration_minutes", "sleep_minutes", "total_sleep_minutes")),
        "score": find_value(d, ("score", "sleep_score")),
        "sleep_at": find_value(d, ("sleep_at", "sleep_time", "start_time", "bed_time")),
        "wake_at": find_value(d, ("wake_at", "wake_time", "end_time", "get_up_time")),
        "segments": find_value(d, ("segments", "sleep_segments", "items", "records")),
    }
    return {k: v for k, v in out.items() if v not in (None, "")}


def summarize_steps(raw: Any) -> dict[str, Any]:
    d = jsonable(raw)
    out = {
        "count": find_value(d, ("count", "steps", "step_count", "step")),
        "distance": find_value(d, ("distance", "distance_m", "distance_meter", "distance_meters")),
        "calories": find_value(d, ("calories", "calorie", "kcal", "calories_kcal")),
    }
    return {k: v for k, v in out.items() if v not in (None, "")}


def summarize_heart(raw: Any) -> dict[str, Any]:
    d = jsonable(raw)
    out = {
        "average": find_value(d, ("average", "avg", "avg_heart_rate", "average_heart_rate")),
        "resting": find_value(d, ("resting", "resting_heart_rate", "rest_hr")),
        "max": find_value(d, ("max", "maximum", "max_heart_rate")),
        "min": find_value(d, ("min", "minimum", "min_heart_rate")),
    }
    return {k: v for k, v in out.items() if v not in (None, "")}


async def query_xiaomi(target_date: str) -> dict[str, Any]:
    if MiHealthClient is None:
        raise RuntimeError("mi_fitness_not_installed")
    if not TOKEN_FILE.exists():
        raise RuntimeError("mi_fitness_token_file_missing")
    if not TARGET_UID:
        raise RuntimeError("mi_fitness_target_uid_missing")

    async with MiHealthClient.from_token(str(TOKEN_FILE)) as client:
        sleep_raw = await client.get_sleep(TARGET_UID, target_date, days=1)
        steps_raw = await client.get_steps(TARGET_UID, target_date)
        heart_raw = await client.get_heart_rate(TARGET_UID, target_date)

    return {
        "connected": True,
        "source": "mi-fitness-python",
        "date": target_date,
        "sleep": summarize_sleep(sleep_raw),
        "steps": summarize_steps(steps_raw),
        "heart_rate": summarize_heart(heart_raw),
        "cycle": None,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "error": "",
    }


async def push_little_phone(payload: dict[str, Any]) -> dict[str, Any]:
    if not LITTLE_PHONE_URL or not LINJIAN_TOKEN:
        raise RuntimeError("little_phone_cloudflare_config_missing")
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"{LITTLE_PHONE_URL}/api/littlephone/health-summary",
            headers={"Authorization": f"Bearer {LINJIAN_TOKEN}", "X-Auth-Token": LINJIAN_TOKEN},
            json=payload,
        )
        response.raise_for_status()
        return response.json()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "little-phone-xiaomi-health-bridge",
        "version": APP_VERSION,
        "mi_fitness_imported": MiHealthClient is not None,
        "token_file_present": TOKEN_FILE.exists(),
        "target_uid_configured": bool(TARGET_UID),
        "little_phone_configured": bool(LITTLE_PHONE_URL and LINJIAN_TOKEN),
        "token_value_exposed": False,
    }


@app.get("/query")
async def query(
    target_date: str = Query(default_factory=lambda: date.today().isoformat(), alias="date"),
    x_bridge_token: str | None = Header(default=None),
) -> dict[str, Any]:
    require_bridge_token(x_bridge_token)
    try:
        return {"ok": True, **(await query_xiaomi(target_date))}
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"error": "xiaomi_health_query_failed", "message": str(exc)[:240]})


@app.post("/sync")
async def sync(
    target_date: str = Query(default_factory=lambda: date.today().isoformat(), alias="date"),
    x_bridge_token: str | None = Header(default=None),
) -> dict[str, Any]:
    require_bridge_token(x_bridge_token)
    try:
        payload = await query_xiaomi(target_date)
        result = await push_little_phone(payload)
        return {"ok": True, "date": target_date, "cloudflare": result}
    except Exception as exc:
        error = str(exc)[:240]
        # Make an expired/missing token visible to the app instead of serving stale data as current.
        try:
            await push_little_phone({
                "connected": False,
                "source": "mi-fitness-python",
                "sleep": None,
                "steps": None,
                "heart_rate": None,
                "cycle": None,
                "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "error": error,
            })
        except Exception:
            pass
        raise HTTPException(status_code=502, detail={"error": "xiaomi_health_sync_failed", "message": error})
