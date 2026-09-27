

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
async def health(
    target_date: str | None = Query(default=None, alias="date"),
    metric: str = Query(default="all", alias="type"),
    x_bridge_token: str | None = Header(default=None),
) -> dict[str, Any]:
    # Without a date this remains a safe diagnostics endpoint. With a date it
    # follows the tutorial's GET /health?date=YYYY-MM-DD&type=all shape.
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
        raise HTTPException(status_code=502, detail={"error": "xiaomi_health_query_failed", "message": str(exc)[:240]})


def validate_date(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date_must_be_yyyy_mm_dd") from exc


def select_metric(payload: dict[str, Any], metric: str) -> dict[str, Any]:
    if metric == "all":
        return payload
    key = {"sleep": "sleep", "heart_rate": "heart_rate", "heart-rate": "heart_rate", "steps": "steps"}.get(metric)
    if not key:
        raise HTTPException(status_code=400, detail="type_must_be_all_sleep_heart_rate_or_steps")
    return {
        "connected": payload.get("connected", False),
        "source": payload.get("source", "mi-fitness-python"),
        "date": payload.get("date"),
        key: payload.get(key),
        "updated_at": payload.get("updated_at"),
        "error": payload.get("error", ""),
    }


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
        raise HTTPException(status_code=502, detail={"error": "xiaomi_health_query_failed", "message": str(exc)[:240]})


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
        error = str(exc)[:240]
        # Make an expired/missing token visible to the app instead of serving stale data as current.
        try:
            await push_little_phone({
                "connected": False,
                "source": "mi-fitness-python",
                "date": target_date,
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

