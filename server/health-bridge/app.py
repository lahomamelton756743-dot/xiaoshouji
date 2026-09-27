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

APP_VERSION = "0.7.2"
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
