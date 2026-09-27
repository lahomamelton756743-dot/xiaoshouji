import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Query

try:
    from mi_fitness import MiHealthClient
except Exception:  # service can still expose diagnostics
    MiHealthClient = None

APP_VERSION = "0.7.2-live2"
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
        return jsonable(value.model_dump())
    if hasattr(value, "dict"):
        try:
            return jsonable(value.dict())
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        return {
            k: jsonable(v)
            for k, v in vars(value).items()
            if not str(k).startswith("_")
        }
    return str(value)


def find_value(obj: Any, names: tuple[str, ...]) -> Any:
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
        "total_minutes": find_value(
            d,
            (
                "total_minutes",
                "duration_minutes",
                "sleep_minutes",
                "total_sleep_minutes",
                "duration",
            ),
        ),
        "score": find_value(d, ("score", "sleep_score")),
        "sleep_at": find_value(
            d, ("sleep_at", "sleep_time", "start_time", "bed_time")
        ),
        "wake_at": find_value(
            d, ("wake_at", "wake_time", "end_time", "get_up_time")
        ),
        "deep_minutes": find_value(d, ("deep_minutes", "deep_sleep_minutes")),
        "light_minutes": find_value(d, ("light_minutes", "light_sleep_minutes")),
        "rem_minutes": find_value(d, ("rem_minutes", "rem_sleep_minutes")),
        "segments": find_value(d, ("segments", "sleep_segments", "items", "records")),
    }
    return {k: v for k, v in out.items() if v not in (None, "")}


def summarize_steps(raw: Any) -> dict[str, Any]:
    d = jsonable(raw)
    out = {
        "count": find_value(d, ("count", "steps", "step_count", "step")),
        "distance": find_value(
            d, ("distance", "distance_m", "distance_meter", "distance_meters")
        ),
        "calories": find_value(d, ("calories", "calorie", "kcal", "calories_kcal")),
    }
    return {k: v for k, v in out.items() if v not in (None, "")}


def summarize_heart(raw: Any) -> dict[str, Any]:
    d = jsonable(raw)
    out = {
        "latest": find_value(d, ("bpm", "latest", "latest_bpm", "heart_rate")),
        "average": find_value(
            d, ("average", "avg", "avg_heart_rate", "average_heart_rate")
        ),
        "resting": find_value(d, ("resting", "resting_heart_rate", "rest_hr")),
        "max": find_value(d, ("max", "maximum", "max_heart_rate")),
        "min": find_value(d, ("min", "minimum", "min_heart_rate")),
    }
    return {k: v for k, v in out.items() if v not in (None, "")}


def _uid_of(member: Any) -> str:
    value = getattr(member, "relative_uid", None)
    if value is None and isinstance(member, dict):
        value = member.get("relative_uid")
    return "" if value is None else str(value)


def _note_of(member: Any) -> str:
    value = getattr(member, "relative_note", None)
    if value is None and isinstance(member, dict):
        value = member.get("relative_note")
    return "" if value is None else str(value)


async def resolve_relative(client: Any) -> tuple[int, list[Any], bool]:
    """Resolve a real relative_uid from Xiaomi instead of trusting an account ID."""
    relatives = await client.get_relatives()
    if not relatives:
        raise RuntimeError(
            "no_relatives_visible_to_token: 小号云端接口没有返回亲友；请确认小号→大号亲友共享已生效"
        )

    if TARGET_UID:
        for member in relatives:
            if _uid_of(member) == TARGET_UID:
                return int(_uid_of(member)), relatives, False

    # If exactly one relative is visible, safely use Xiaomi's returned relative_uid.
    if len(relatives) == 1:
        return int(_uid_of(relatives[0])), relatives, True

    available = ",".join(_uid_of(m) for m in relatives)
    raise RuntimeError(
        "target_uid_not_in_relatives: MI_FITNESS_TARGET_UID 必须是 relative_uid; "
        f"当前可见 relative_uid={available}"
    )


async def latest_snapshot(client: Any, uid: int) -> tuple[Any, list[str]]:
    latest = await client.get_latest_data(uid)
    raw = jsonable(latest)
    keys = getattr(latest, "available_keys", None)
    if keys is None and isinstance(raw, dict):
        keys = raw.get("available_keys") or []
    return latest, list(keys or [])


async def query_xiaomi(target_date: str) -> dict[str, Any]:
    if MiHealthClient is None:
        raise RuntimeError("mi_fitness_not_installed")
    if not TOKEN_FILE.exists():
        raise RuntimeError("mi_fitness_token_file_missing")

    query_date = date.fromisoformat(target_date)
    today = date.today()

    async with MiHealthClient.from_token(str(TOKEN_FILE)) as client:
        uid, relatives, auto_uid = await resolve_relative(client)
        shared_types: list[str] = []
        try:
            shared_types = list(await client.get_shared_data_types(uid))
        except Exception:
            pass

        latest, available_keys = await latest_snapshot(client, uid)
        latest_raw = jsonable(latest)

        # For "live"/today queries prefer get_latest_data(). It is the SDK's current
        # recommended realtime snapshot API and avoids Xiaomi rejecting a per-type key.
        if query_date == today:
            sleep_raw = getattr(latest, "sleep", None)
            steps_raw = getattr(latest, "steps", None)
            heart_raw = getattr(latest, "heart_rate", None)
            if isinstance(latest_raw, dict):
                sleep_raw = sleep_raw if sleep_raw is not None else latest_raw.get("sleep")
                steps_raw = steps_raw if steps_raw is not None else latest_raw.get("steps")
                heart_raw = heart_raw if heart_raw is not None else latest_raw.get("heart_rate")
            metric_errors: dict[str, str] = {}
        else:
            # Historical queries are isolated per metric so one Xiaomi key failure does
            # not make all health data fail.
            metric_errors = {}
            sleep_raw = steps_raw = heart_raw = None
            for name, method in (
                ("sleep", client.get_sleep),
                ("steps", client.get_steps),
                ("heart_rate", client.get_heart_rate),
            ):
                if shared_types and name not in shared_types:
                    metric_errors[name] = "not_shared"
                    continue
                try:
                    value = await method(uid, query_date)
                    if name == "sleep":
                        sleep_raw = value
                    elif name == "steps":
                        steps_raw = value
                    else:
                        heart_raw = value
                except Exception as exc:
                    metric_errors[name] = str(exc)[:180]

        sleep = summarize_sleep(sleep_raw)
        steps = summarize_steps(steps_raw)
        heart = summarize_heart(heart_raw)

    return {
        "connected": True,
        "source": "mi-fitness-python",
        "date": target_date,
        "relative_uid": uid,
        "target_uid_auto_resolved": auto_uid,
        "available_keys": available_keys,
        "shared_data_types": shared_types,
        "sleep": sleep,
        "steps": steps,
        "heart_rate": heart,
        "metric_errors": metric_errors,
        "cycle": None,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "error": "",
    }


async def push_little_phone(payload: dict[str, Any]) -> dict[str, Any]:
    if not LITTLE_PHONE_URL or not LINJIAN_TOKEN:
        raise RuntimeError("little_phone_cloudflare_config_missing")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{LITTLE_PHONE_URL}/api/littlephone/health-summary",
            headers={
                "Authorization": f"Bearer {LINJIAN_TOKEN}",
                "X-Auth-Token": LINJIAN_TOKEN,
            },
            json=payload,
        )
        response.raise_for_status()
        return response.json()


def validate_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date_must_be_yyyy_mm_dd") from exc


def select_metric(payload: dict[str, Any], metric: str) -> dict[str, Any]:
    if metric == "all":
        return payload
    key = {
        "sleep": "sleep",
        "heart_rate": "heart_rate",
        "heart-rate": "heart_rate",
        "steps": "steps",
    }.get(metric)
    if not key:
        raise HTTPException(
            status_code=400,
            detail="type_must_be_all_sleep_heart_rate_or_steps",
        )
    return {
        "connected": payload.get("connected", False),
        "source": payload.get("source", "mi-fitness-python"),
        "date": payload.get("date"),
        "relative_uid": payload.get("relative_uid"),
        key: payload.get(key),
        "metric_error": (payload.get("metric_errors") or {}).get(key),
        "updated_at": payload.get("updated_at"),
        "error": payload.get("error", ""),
    }


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
    try:
        payload = await query_xiaomi(target_date)
        return {"ok": True, **select_metric(payload, metric)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"error": "xiaomi_health_query_failed", "message": str(exc)[:400]},
        )


@app.get("/probe")
async def probe(x_bridge_token: str | None = Header(default=None)) -> dict[str, Any]:
    """Relationship diagnostic: compare Xiaomi 'relatives' vs 'family members'."""
    require_bridge_token(x_bridge_token)
    if MiHealthClient is None:
        raise HTTPException(status_code=500, detail="mi_fitness_not_installed")
    if not TOKEN_FILE.exists():
        raise HTTPException(status_code=500, detail="mi_fitness_token_file_missing")
    try:
        async with MiHealthClient.from_token(str(TOKEN_FILE)) as client:
            relatives = []
            relatives_error = ""
            try:
                relatives = list(await client.get_relatives())
            except Exception as exc:
                relatives_error = str(exc)[:240]

            family = []
            family_error = ""
            try:
                family = list(await client.get_family_members())
            except Exception as exc:
                family_error = str(exc)[:240]

            has_invite: Any = None
            invite_error = ""
            try:
                has_invite = await client.has_new_invite()
            except Exception as exc:
                invite_error = str(exc)[:240]

            verified_target: Any = None
            verify_error = ""
            if TARGET_UID:
                try:
                    verified_target = jsonable(await client.verify_user(TARGET_UID))
                except Exception as exc:
                    verify_error = str(exc)[:240]

            result: dict[str, Any] = {
                "ok": True,
                "target_uid_configured": bool(TARGET_UID),
                "relatives_count": len(relatives),
                "relatives": [
                    {"relative_uid": _uid_of(m), "note": _note_of(m), "raw": jsonable(m)}
                    for m in relatives
                ],
                "relatives_error": relatives_error,
                "family_count": len(family),
                "family_members": [jsonable(m) for m in family],
                "family_error": family_error,
                "has_new_invite": jsonable(has_invite),
                "invite_error": invite_error,
                "verified_target": verified_target,
                "verify_error": verify_error,
            }

            # Only query health if the actual relative API returns a usable relative_uid.
            if relatives:
                try:
                    uid, _, auto_uid = await resolve_relative(client)
                    shared: list[str] = []
                    try:
                        shared = list(await client.get_shared_data_types(uid))
                    except Exception as exc:
                        shared = [f"ERROR:{str(exc)[:120]}"]
                    latest, available = await latest_snapshot(client, uid)
                    result.update({
                        "resolved_relative_uid": uid,
                        "auto_resolved": auto_uid,
                        "shared_data_types": shared,
                        "latest_available_keys": available,
                        "latest_has_sleep": getattr(latest, "sleep", None) is not None,
                        "latest_has_steps": getattr(latest, "steps", None) is not None,
                        "latest_has_heart_rate": getattr(latest, "heart_rate", None) is not None,
                    })
                except Exception as exc:
                    result["relative_health_probe_error"] = str(exc)[:400]
            else:
                result["diagnosis"] = (
                    "token_authenticated_but_relatives_api_returned_zero; "
                    "check family_members/has_new_invite. Health queries require a real relative_uid."
                )
            return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"error": "xiaomi_probe_failed", "message": str(exc)[:400]},
        )


@app.get("/query")
async def query(
    target_date: str = Query(default_factory=lambda: date.today().isoformat(), alias="date"),
    metric: str = Query(default="all", alias="type"),
    x_bridge_token: str | None = Header(default=None),
) -> dict[str, Any]:
    require_bridge_token(x_bridge_token)
    target_date = validate_date(target_date)
    try:
        payload = await query_xiaomi(target_date)
        return {"ok": True, **select_metric(payload, metric)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"error": "xiaomi_health_query_failed", "message": str(exc)[:400]},
        )


@app.post("/sync")
async def sync(
    target_date: str = Query(default_factory=lambda: date.today().isoformat(), alias="date"),
    x_bridge_token: str | None = Header(default=None),
) -> dict[str, Any]:
    require_bridge_token(x_bridge_token)
    target_date = validate_date(target_date)
    try:
        payload = await query_xiaomi(target_date)
        result = await push_little_phone(payload)
        return {"ok": True, "date": target_date, "cloudflare": result}
    except Exception as exc:
        error = str(exc)[:400]
        try:
            await push_little_phone(
                {
                    "connected": False,
                    "source": "mi-fitness-python",
                    "date": target_date,
                    "sleep": None,
                    "steps": None,
                    "heart_rate": None,
                    "cycle": None,
                    "updated_at": datetime.now(timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z"),
                    "error": error,
                }
            )
        except Exception:
            pass
        raise HTTPException(
            status_code=502,
            detail={"error": "xiaomi_health_sync_failed", "message": error},
        )
