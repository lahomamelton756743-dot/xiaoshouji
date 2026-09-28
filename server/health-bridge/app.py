import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx
from fastapi import FastAPI, Header, HTTPException, Query

try:
    from mi_fitness import MiHealthClient
except Exception:
    MiHealthClient = None

APP_VERSION = "0.7.6-final-compat"
TOKEN_FILE = Path(os.getenv("MI_FITNESS_TOKEN_FILE", "token.json"))
TARGET_UID = os.getenv("MI_FITNESS_TARGET_UID", "").strip()
LITTLE_PHONE_URL = os.getenv(
    "LITTLE_PHONE_URL",
    "https://little-phone-backend.lahomamelton756743.workers.dev",
).rstrip("/")
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
        try:
            return jsonable(value.model_dump())
        except Exception:
            pass
    if hasattr(value, "dict"):
        try:
            return jsonable(value.dict())
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        return {
            str(k): jsonable(v)
            for k, v in vars(value).items()
            if not str(k).startswith("_")
        }
    return str(value)


def _first_nonempty(value: Any) -> Any:
    if isinstance(value, list):
        for item in value:
            if item not in (None, {}, [], ""):
                return item
        return None
    return value


def find_value(obj: Any, names: tuple[str, ...]) -> Any:
    if isinstance(obj, dict):
        lowered = {str(k).lower(): v for k, v in obj.items()}
        for name in names:
            v = lowered.get(name.lower())
            if v not in (None, "", [], {}):
                return v
        for v in obj.values():
            hit = find_value(v, names)
            if hit not in (None, "", [], {}):
                return hit
    elif isinstance(obj, list):
        for v in obj:
            hit = find_value(v, names)
            if hit not in (None, "", [], {}):
                return hit
    return None


def summarize_sleep(raw: Any) -> dict[str, Any]:
    d = jsonable(_first_nonempty(raw))
    out = {
        "total_minutes": find_value(d, ("total_duration", "total_minutes", "duration_minutes", "sleep_minutes", "duration")),
        "score": find_value(d, ("sleep_score", "score")),
        "sleep_at": find_value(d, ("bedtime", "sleep_at", "sleep_time", "start_time", "bed_time")),
        "wake_at": find_value(d, ("wake_up_time", "wake_at", "wake_time", "end_time", "get_up_time")),
        "deep_minutes": find_value(d, ("sleep_deep_duration", "deep_minutes", "deep_sleep_minutes")),
        "light_minutes": find_value(d, ("sleep_light_duration", "light_minutes", "light_sleep_minutes")),
        "rem_minutes": find_value(d, ("sleep_rem_duration", "rem_minutes", "rem_sleep_minutes")),
        "awake_minutes": find_value(d, ("sleep_awake_duration", "awake_minutes")),
        "segments": find_value(d, ("segment_details", "segments", "sleep_segments", "items", "records")),
    }
    return {k: v for k, v in out.items() if v not in (None, "", [], {})}


def summarize_steps(raw: Any) -> dict[str, Any]:
    d = jsonable(_first_nonempty(raw))
    out = {
        "count": find_value(d, ("steps", "count", "step_count", "step")),
        "distance": find_value(d, ("distance", "distance_m", "distance_meter", "distance_meters")),
        "calories": find_value(d, ("calories", "calorie", "kcal", "calories_kcal")),
        "goal": find_value(d, ("goal", "steps_goal")),
    }
    return {k: v for k, v in out.items() if v not in (None, "")}


def summarize_heart(raw: Any) -> dict[str, Any]:
    d = jsonable(_first_nonempty(raw))
    latest_obj = find_value(d, ("latest_hr", "latest_heart_rate"))
    latest_bpm = find_value(latest_obj, ("bpm", "heart_rate")) if latest_obj is not None else None
    out = {
        "latest": latest_bpm or find_value(d, ("bpm", "latest", "latest_bpm", "heart_rate")),
        "average": find_value(d, ("avg_hr", "average", "avg", "avg_heart_rate", "average_heart_rate")),
        "resting": find_value(d, ("avg_rhr", "resting", "resting_heart_rate", "rest_hr")),
        "max": find_value(d, ("max_hr", "max", "maximum", "max_heart_rate")),
        "min": find_value(d, ("min_hr", "min", "minimum", "min_heart_rate")),
        "latest_at": find_value(latest_obj, ("time", "timestamp", "at")) if latest_obj is not None else None,
    }
    return {k: v for k, v in out.items() if v not in (None, "")}


def validate_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date_must_be_yyyy_mm_dd") from exc


def _uid_from_relative(member: Any) -> int | None:
    v = getattr(member, "relative_uid", None)
    if v is None and isinstance(member, dict):
        v = member.get("relative_uid")
    try:
        return int(v) if v is not None else None
    except Exception:
        return None


def _uid_from_family(member: Any) -> int | None:
    raw = jsonable(member)
    if not isinstance(raw, dict):
        return None
    for key in ("userId", "user_id", "uid", "relative_uid"):
        if key in raw:
            try:
                return int(raw[key])
            except Exception:
                pass
    return None


def _name_from_family(member: Any) -> str:
    raw = jsonable(member)
    if isinstance(raw, dict):
        return str(raw.get("nickname") or raw.get("name") or raw.get("relative_note") or "")
    return ""


async def _safe_call(label: str, fn: Callable[[], Awaitable[Any]]) -> tuple[Any, str]:
    try:
        return await fn(), ""
    except Exception as exc:
        return None, f"{label}: {str(exc)[:260]}"


async def collect_candidates(client: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    diagnostics: dict[str, Any] = {}
    candidates: list[dict[str, Any]] = []

    relatives, rel_err = await _safe_call("get_relatives", client.get_relatives)
    relatives = list(relatives or [])
    diagnostics["relatives_count"] = len(relatives)
    diagnostics["relatives_error"] = rel_err
    diagnostics["relatives"] = jsonable(relatives)
    for m in relatives:
        uid = _uid_from_relative(m)
        if uid:
            candidates.append({"uid": uid, "source": "relatives", "name": str(getattr(m, "relative_note", "") or "")})

    family, fam_err = await _safe_call("get_family_members", client.get_family_members)
    family = list(family or [])
    diagnostics["family_count"] = len(family)
    diagnostics["family_error"] = fam_err
    diagnostics["family_members"] = jsonable(family)
    for m in family:
        uid = _uid_from_family(m)
        if uid:
            candidates.append({"uid": uid, "source": "family", "name": _name_from_family(m)})

    if TARGET_UID:
        try:
            candidates.append({"uid": int(TARGET_UID), "source": "configured", "name": ""})
        except ValueError:
            diagnostics["configured_uid_error"] = "MI_FITNESS_TARGET_UID_not_integer"

    deduped: list[dict[str, Any]] = []
    seen: set[int] = set()
    for c in candidates:
        uid = c["uid"]
        if uid not in seen:
            seen.add(uid)
            deduped.append(c)

    invite, invite_err = await _safe_call("has_new_invite", client.has_new_invite)
    diagnostics["has_new_invite"] = jsonable(invite)
    diagnostics["invite_error"] = invite_err
    return deduped, diagnostics


async def try_uid_health(client: Any, uid: int, query_date: date) -> tuple[dict[str, Any] | None, dict[str, str]]:
    errors: dict[str, str] = {}
    raw_latest = None
    raw_summary = None

    # Realtime/most recent paths first. These avoid hard-coding a Xiaomi data key.
    raw_latest, err = await _safe_call("get_latest_data", lambda: client.get_latest_data(uid))
    if err:
        errors["latest"] = err

    raw_summary, err = await _safe_call("get_latest_daily_summary", lambda: client.get_latest_daily_summary(uid))
    if err:
        errors["latest_daily_summary"] = err

    # Requested-date summary, then independent per-metric fallbacks.
    raw_daily = None
    if query_date != date.today():
        raw_daily, err = await _safe_call("get_daily_summary", lambda: client.get_daily_summary(uid, query_date))
        if err:
            errors["daily_summary"] = err

    latest_j = jsonable(raw_latest)
    latest_summary_j = jsonable(raw_summary)
    daily_j = jsonable(raw_daily)

    def pick_metric(key: str) -> Any:
        for container in (daily_j, latest_summary_j, latest_j):
            if isinstance(container, dict):
                v = container.get(key)
                if v not in (None, {}, [], ""):
                    return v
        return None

    sleep_raw = pick_metric("sleep")
    steps_raw = pick_metric("steps")
    heart_raw = pick_metric("heart_rate")

    # SDK summary objects may use attributes; jsonable usually converts them, but keep a direct fallback.
    for key, attr in (("sleep", "sleep"), ("steps", "steps"), ("heart_rate", "heart_rate")):
        if key == "sleep" and sleep_raw is None:
            for obj in (raw_daily, raw_summary, raw_latest):
                v = getattr(obj, attr, None) if obj is not None else None
                if v is not None:
                    sleep_raw = v; break
        if key == "steps" and steps_raw is None:
            for obj in (raw_daily, raw_summary, raw_latest):
                v = getattr(obj, attr, None) if obj is not None else None
                if v is not None:
                    steps_raw = v; break
        if key == "heart_rate" and heart_raw is None:
            for obj in (raw_daily, raw_summary, raw_latest):
                v = getattr(obj, attr, None) if obj is not None else None
                if v is not None:
                    heart_raw = v; break

    # If summary/latest paths did not yield a metric, try that metric independently.
    if sleep_raw is None:
        sleep_raw, err = await _safe_call("get_sleep", lambda: client.get_sleep(uid, query_date, days=1))
        if err: errors["sleep"] = err
    if steps_raw is None:
        steps_raw, err = await _safe_call("get_steps", lambda: client.get_steps(uid, query_date, days=1))
        if err: errors["steps"] = err
    if heart_raw is None:
        heart_raw, err = await _safe_call("get_heart_rate", lambda: client.get_heart_rate(uid, query_date, days=1))
        if err: errors["heart_rate"] = err

    sleep = summarize_sleep(sleep_raw)
    steps = summarize_steps(steps_raw)
    heart = summarize_heart(heart_raw)
    any_data = bool(sleep or steps or heart)

    available_keys: list[str] = []
    if raw_latest is not None:
        keys = getattr(raw_latest, "available_keys", None)
        if keys:
            available_keys = [str(x) for x in keys]
        elif isinstance(latest_j, dict) and isinstance(latest_j.get("available_keys"), list):
            available_keys = [str(x) for x in latest_j["available_keys"]]

    if not any_data:
        return None, errors

    return {
        "connected": True,
        "source": "mi-fitness-python",
        "date": query_date.isoformat(),
        "resolved_uid": uid,
        "available_keys": available_keys,
        "sleep": sleep,
        "steps": steps,
        "heart_rate": heart,
        "metric_errors": errors,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "error": "",
    }, errors


async def query_xiaomi(target_date: str) -> dict[str, Any]:
    if MiHealthClient is None:
        raise RuntimeError("mi_fitness_not_installed")
    if not TOKEN_FILE.exists():
        raise RuntimeError("mi_fitness_token_file_missing")

    query_date = date.fromisoformat(target_date)
    async with MiHealthClient.from_token(str(TOKEN_FILE)) as client:
        candidates, diagnostics = await collect_candidates(client)
        attempts: list[dict[str, Any]] = []

        for candidate in candidates:
            payload, errors = await try_uid_health(client, candidate["uid"], query_date)
            attempts.append({
                "uid": candidate["uid"],
                "source": candidate["source"],
                "name": candidate.get("name", ""),
                "errors": errors,
                "worked": payload is not None,
            })
            if payload is not None:
                payload["uid_source"] = candidate["source"]
                payload["uid_name"] = candidate.get("name", "")
                payload["diagnostics"] = {
                    "relatives_count": diagnostics.get("relatives_count", 0),
                    "family_count": diagnostics.get("family_count", 0),
                    "has_new_invite": diagnostics.get("has_new_invite"),
                    "attempts": attempts,
                }
                return payload

        return {
            "connected": False,
            "source": "mi-fitness-python",
            "date": target_date,
            "sleep": {},
            "steps": {},
            "heart_rate": {},
            "metric_errors": {},
            "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "error": "no_candidate_uid_returned_health_data",
            "diagnostics": {**diagnostics, "attempts": attempts},
        }


def select_metric(payload: dict[str, Any], metric: str) -> dict[str, Any]:
    if metric == "all":
        return payload
    key = {"sleep": "sleep", "heart_rate": "heart_rate", "heart-rate": "heart_rate", "steps": "steps"}.get(metric)
    if not key:
        raise HTTPException(status_code=400, detail="type_must_be_all_sleep_heart_rate_or_steps")
    return {
        "connected": payload.get("connected", False),
        "source": payload.get("source"),
        "date": payload.get("date"),
        "resolved_uid": payload.get("resolved_uid"),
        "uid_source": payload.get("uid_source"),
        key: payload.get(key) or {},
        "metric_error": (payload.get("metric_errors") or {}).get(key),
        "updated_at": payload.get("updated_at"),
        "error": payload.get("error", ""),
    }


async def push_little_phone(payload: dict[str, Any]) -> dict[str, Any]:
    if not LITTLE_PHONE_URL or not LINJIAN_TOKEN:
        raise RuntimeError("little_phone_cloudflare_config_missing")
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.post(
            f"{LITTLE_PHONE_URL}/api/littlephone/health-summary",
            headers={"Authorization": f"Bearer {LINJIAN_TOKEN}", "X-Auth-Token": LINJIAN_TOKEN},
            json=payload,
        )
        response.raise_for_status()
        return response.json()


@app.get("/health")
async def health(
    target_date: str | None = Query(default=None, alias="date"),
    metric: str = Query(default="all", alias="type"),
    x_bridge_token: str | None = Header(default=None),
) -> dict[str, Any]:
    if not target_date:
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
    require_bridge_token(x_bridge_token)
    target_date = validate_date(target_date)
    payload = await query_xiaomi(target_date)
    return {"ok": True, **select_metric(payload, metric)}


@app.get("/probe")
async def probe(x_bridge_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_bridge_token(x_bridge_token)
    if MiHealthClient is None:
        raise HTTPException(status_code=500, detail="mi_fitness_not_installed")
    if not TOKEN_FILE.exists():
        raise HTTPException(status_code=500, detail="mi_fitness_token_file_missing")

    async with MiHealthClient.from_token(str(TOKEN_FILE)) as client:
        candidates, diagnostics = await collect_candidates(client)
        attempts: list[dict[str, Any]] = []
        for c in candidates:
            payload, errors = await try_uid_health(client, c["uid"], date.today())
            attempts.append({
                "uid": c["uid"],
                "source": c["source"],
                "name": c.get("name", ""),
                "worked": payload is not None,
                "errors": errors,
                "has_sleep": bool(payload and payload.get("sleep")),
                "has_steps": bool(payload and payload.get("steps")),
                "has_heart_rate": bool(payload and payload.get("heart_rate")),
            })
        return {"ok": True, **diagnostics, "candidates": candidates, "attempts": attempts}


@app.get("/query")
async def query(
    target_date: str = Query(default_factory=lambda: date.today().isoformat(), alias="date"),
    metric: str = Query(default="all", alias="type"),
    x_bridge_token: str | None = Header(default=None),
) -> dict[str, Any]:
    require_bridge_token(x_bridge_token)
    target_date = validate_date(target_date)
    payload = await query_xiaomi(target_date)
    return {"ok": True, **select_metric(payload, metric)}


@app.post("/sync")
async def sync(
    target_date: str = Query(default_factory=lambda: date.today().isoformat(), alias="date"),
    x_bridge_token: str | None = Header(default=None),
) -> dict[str, Any]:
    require_bridge_token(x_bridge_token)
    target_date = validate_date(target_date)
    payload = await query_xiaomi(target_date)
    if not payload.get("connected"):
        return {"ok": False, "date": target_date, "health": payload, "cloudflare": None}
    result = await push_little_phone(payload)
    return {"ok": True, "date": target_date, "health": payload, "cloudflare": result}
