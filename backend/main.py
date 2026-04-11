import asyncio
import json
import math
import os
import time
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel, Field

from zip_data import ZIP_IMPACT

load_dotenv()

GROQ_TIMEOUT = httpx.Timeout(connect=45.0, read=120.0, write=45.0, pool=45.0)
GROQ_MAX_RETRIES = 5
GROQ_CALL_RETRIES = 3
GROQ_RETRY_BASE_SLEEP_S = 1.25

ELECTRICITY_MAPS_BASE = "https://api.electricitymaps.com/v3/carbon-intensity"
ZONE = "US-SE-SOCO"

app = FastAPI(title="WattWatch ATL API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _georgia_solar_curve_g_per_kwh(hour_of_day: float) -> float:
    """~450 at midnight, ~280 at 1pm, ~480 at 8pm (gCO2eq/kWh)."""
    h = hour_of_day % 24

    def lerp(a: float, b: float, t: float) -> float:
        return a + (b - a) * t

    if h <= 13:
        return lerp(450, 280, h / 13)
    if h <= 20:
        return lerp(280, 480, (h - 13) / 7)
    return lerp(480, 450, (h - 20) / 4)


def mock_carbon_payload() -> dict:
    now = datetime.now(timezone.utc)
    history: list[float] = []
    for i in range(24):
        t = now - timedelta(hours=23 - i)
        hod = t.hour + t.minute / 60.0
        history.append(round(_georgia_solar_curve_g_per_kwh(hod), 1))
    hod_now = now.hour + now.minute / 60.0
    current = round(_georgia_solar_curve_g_per_kwh(hod_now), 1)
    return {
        "current": current,
        "unit": "gCO2eq/kWh",
        "history": history,
    }


def _extract_intensity(obj: dict) -> float | None:
    if obj is None:
        return None
    for key in ("carbonIntensity", "carbon_intensity", "value", "intensity"):
        v = obj.get(key)
        if isinstance(v, (int, float)):
            return float(v)
    data = obj.get("data")
    if isinstance(data, dict):
        return _extract_intensity(data)
    return None


def _parse_latest_json(data: dict) -> float | None:
    return _extract_intensity(data)


def _parse_history_json(data: dict) -> list[float] | None:
    if not isinstance(data, dict):
        return None
    raw = data.get("history") or data.get("data") or data.get("carbonIntensityHistory")
    if not isinstance(raw, list) or not raw:
        return None
    out: list[float] = []
    for item in raw:
        if isinstance(item, (int, float)):
            out.append(float(item))
        elif isinstance(item, dict):
            v = _extract_intensity(item)
            if v is not None:
                out.append(v)
    return out if out else None


async def fetch_carbon_from_api() -> dict | None:
    key = os.getenv("ELECTRICITY_MAPS_KEY", "").strip()
    if not key or key == "PASTE_YOUR_KEY_HERE":
        return None
    headers = {"auth-token": key}
    timeout = httpx.Timeout(12.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        latest_url = f"{ELECTRICITY_MAPS_BASE}/latest?zone={ZONE}"
        history_url = f"{ELECTRICITY_MAPS_BASE}/history?zone={ZONE}"
        latest_r = await client.get(latest_url, headers=headers)
        latest_r.raise_for_status()
        history_r = await client.get(history_url, headers=headers)
        history_r.raise_for_status()
        latest_data = latest_r.json()
        history_data = history_r.json()
        current = _parse_latest_json(latest_data)
        history = _parse_history_json(history_data)
        if current is None:
            return None
        if history is None or len(history) < 24:
            now = datetime.now(timezone.utc)
            history = []
            for i in range(24):
                t = now - timedelta(hours=23 - i)
                hod = t.hour + t.minute / 60.0
                history.append(round(_georgia_solar_curve_g_per_kwh(hod), 1))
        else:
            history = [round(float(x), 1) for x in history[-24:]]
        return {
            "current": round(float(current), 1),
            "unit": "gCO2eq/kWh",
            "history": history,
        }


@app.get("/api/carbon-intensity")
async def carbon_intensity():
    try:
        payload = await fetch_carbon_from_api()
        if payload is not None:
            return payload
    except Exception:
        pass
    return mock_carbon_payload()


NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_UA = (
    "WattWatch-ATL/1.0 (https://github.com; energy-map demo — reverse geocode)"
)


@app.get("/api/reverse-geocode")
async def reverse_geocode(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """
    Proxy to OpenStreetMap Nominatim (identifying User-Agent required).
    Returns US-style postcode when available.
    """
    params = {"lat": lat, "lon": lon, "format": "json"}
    headers = {"User-Agent": NOMINATIM_UA}
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                NOMINATIM_REVERSE,
                params=params,
                headers=headers,
                timeout=12.0,
            )
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, json.JSONDecodeError, TypeError, ValueError):
        return {"postcode": None}
    addr = data.get("address")
    if not isinstance(addr, dict):
        return {"postcode": None}
    raw = addr.get("postcode")
    if raw is None:
        return {"postcode": None}
    pc = str(raw).strip()
    # "30318-1234" → 30318
    head = pc.split("-")[0].replace(" ", "")
    digits = "".join(c for c in head if c.isdigit())
    if len(digits) >= 5:
        return {"postcode": digits[:5]}
    return {"postcode": None}


async def _carbon_history_24() -> list[float]:
    """24 hourly gCO2eq/kWh values (index 0 = 12am … 23 = 11pm for scheduling)."""
    try:
        payload = await fetch_carbon_from_api()
        if payload is not None and len(payload.get("history", [])) >= 24:
            return [float(x) for x in payload["history"][-24:]]
    except Exception:
        pass
    h = mock_carbon_payload()["history"]
    return [float(x) for x in h]


def _compute_best_window(
    history: list[float], duration: int, deadline: int
) -> dict:
    """
    Contiguous duration-hour window with lowest average intensity.
    Deadline is exclusive end hour (e.g. 6 = job must finish before hour 6).
    midnight = 24 means full calendar day.
    With 48 values (24 real + 24 forecast), cap extends to min(48, deadline + 24).
    """
    n = len(history)
    if n < 24:
        raise ValueError("Need at least 24 hourly values")
    if duration < 1 or duration > 24:
        raise ValueError("Invalid duration")
    if n >= 48:
        cap = min(48, deadline + 24)
    else:
        cap = min(24, deadline)
    if cap < duration:
        raise ValueError("No feasible window before deadline")

    full_range = range(0, cap - duration + 1)

    worst_avg = 0.0
    for s in full_range:
        chunk = history[s : s + duration]
        avg = sum(chunk) / len(chunk)
        if avg > worst_avg:
            worst_avg = avg

    if n >= 48:
        forecast_feasible = [s for s in full_range if s >= 24]
        search = forecast_feasible if forecast_feasible else list(full_range)
    else:
        search = list(full_range)

    best_s = search[0]
    best_avg = float("inf")
    for s in search:
        chunk = history[s : s + duration]
        avg = sum(chunk) / len(chunk)
        if avg < best_avg:
            best_avg = avg
            best_s = s

    recommendation_source = (
        "forecast" if (n >= 48 and best_s >= 24) else "historical"
    )

    if worst_avg <= 0:
        carbon_saved_percent = 0.0
    else:
        carbon_saved_percent = max(
            0.0, ((worst_avg - best_avg) / worst_avg) * 100.0
        )

    now_start = max(0, 24 - duration)
    now_window_avg = sum(history[now_start:24]) / float(duration)
    if now_window_avg <= 0:
        carbon_saved_vs_now_percent = 0.0
    else:
        carbon_saved_vs_now_percent = max(
            0.0, ((now_window_avg - best_avg) / now_window_avg) * 100.0
        )

    equivalent_car_miles_saved = carbon_saved_percent * float(duration) * 12.0

    return {
        "best_start_hour": best_s,
        "best_end_hour": best_s + duration - 1,
        "avg_carbon_intensity": round(best_avg, 2),
        "carbon_saved_percent": round(carbon_saved_percent, 1),
        "carbon_saved_vs_now_percent": round(carbon_saved_vs_now_percent, 1),
        "equivalent_car_miles_saved": round(equivalent_car_miles_saved, 1),
        "ai_predicted_window": recommendation_source == "forecast",
        "recommendation_source": recommendation_source,
    }


@app.get("/api/best-window")
async def best_window(
    duration: int = Query(..., ge=1, le=24),
    deadline: int = Query(..., ge=1, le=24),
):
    """
    Find lowest-carbon contiguous window of `duration` hours finishing before `deadline`.
    Use deadline=24 for end-of-day (full 24h horizon).
    """
    if duration not in (1, 2, 4, 6, 8):
        raise HTTPException(
            status_code=400,
            detail="duration must be one of 1, 2, 4, 6, 8",
        )
    allowed_deadlines = (6, 9, 12, 15, 18, 21, 24)
    if deadline not in allowed_deadlines:
        raise HTTPException(
            status_code=400,
            detail=f"deadline must be one of {allowed_deadlines}",
        )

    hist24, forecast24 = await _history_and_forecast_24()
    combined = hist24 + forecast24
    try:
        result = _compute_best_window(combined, duration, deadline)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return result


@app.get("/api/carbon-forecast")
async def carbon_forecast():
    """
    Last 24h real intensity plus Groq (or fallback) forecast for the next 24h.
    """
    history, forecast = await _history_and_forecast_24()
    return {
        "history": [round(float(x), 1) for x in history],
        "forecast": [round(float(x), 1) for x in forecast],
    }


DATACENTERS = [
    {
        "name": "QTS Atlanta",
        "county": "Douglas County",
        "lat": 33.9940,
        "lon": -84.7427,
        "capacity_mw": 450,
        "pue": 1.45,
        "renewable_pct": 12,
    },
    {
        "name": "Switch Atlanta",
        "county": "Fulton County",
        "lat": 33.7490,
        "lon": -84.3880,
        "capacity_mw": 280,
        "pue": 1.38,
        "renewable_pct": 18,
    },
    {
        "name": "Compass Datacenters",
        "county": "Douglas County",
        "lat": 33.7749,
        "lon": -84.5549,
        "capacity_mw": 180,
        "pue": 1.52,
        "renewable_pct": 8,
    },
    {
        "name": "CyrusOne Atlanta",
        "county": "Gwinnett County",
        "lat": 33.9526,
        "lon": -84.0799,
        "capacity_mw": 320,
        "pue": 1.41,
        "renewable_pct": 15,
    },
    {
        "name": "Equinix AT1",
        "county": "Midtown Atlanta",
        "lat": 33.7886,
        "lon": -84.3902,
        "capacity_mw": 95,
        "pue": 1.35,
        "renewable_pct": 22,
    },
    {
        "name": "Digital Realty ATL",
        "county": "Fulton County",
        "lat": 33.8486,
        "lon": -84.4169,
        "capacity_mw": 210,
        "pue": 1.48,
        "renewable_pct": 10,
    },
    {
        "name": "Microsoft Azure",
        "county": "Douglas County",
        "lat": 33.9540,
        "lon": -84.7427,
        "capacity_mw": 500,
        "pue": 1.32,
        "renewable_pct": 35,
    },
    {
        "name": "Google Atlanta",
        "county": "Fulton County",
        "lat": 33.7765,
        "lon": -84.3902,
        "capacity_mw": 150,
        "pue": 1.28,
        "renewable_pct": 67,
    },
    {
        "name": "Iron Mountain Atlanta",
        "county": "Fulton County",
        "lat": 33.8194,
        "lon": -84.3994,
        "capacity_mw": 85,
        "pue": 1.55,
        "renewable_pct": 25,
    },
    {
        "name": "T5 Data Centers",
        "county": "Douglas County",
        "lat": 33.9850,
        "lon": -84.7200,
        "capacity_mw": 120,
        "pue": 1.42,
        "renewable_pct": 10,
    },
    {
        "name": "Flexential Atlanta",
        "county": "Gwinnett County",
        "lat": 33.8900,
        "lon": -84.0200,
        "capacity_mw": 95,
        "pue": 1.44,
        "renewable_pct": 12,
    },
    {
        "name": "DataBank Atlanta",
        "county": "Fulton County",
        "lat": 33.7600,
        "lon": -84.4200,
        "capacity_mw": 75,
        "pue": 1.38,
        "renewable_pct": 20,
    },
    {
        "name": "Zayo Atlanta",
        "county": "Midtown Atlanta",
        "lat": 33.7800,
        "lon": -84.3800,
        "capacity_mw": 45,
        "pue": 1.36,
        "renewable_pct": 18,
    },
    {
        "name": "365 Data Centers",
        "county": "Gwinnett County",
        "lat": 33.9200,
        "lon": -84.0600,
        "capacity_mw": 55,
        "pue": 1.47,
        "renewable_pct": 8,
    },
    {
        "name": "Tierpoint Atlanta",
        "county": "Fulton County",
        "lat": 33.8300,
        "lon": -84.3600,
        "capacity_mw": 65,
        "pue": 1.43,
        "renewable_pct": 14,
    },
    {
        "name": "CDC (Colo Data Center)",
        "county": "Douglas County",
        "lat": 33.9700,
        "lon": -84.6800,
        "capacity_mw": 40,
        "pue": 1.51,
        "renewable_pct": 6,
    },
]


@app.get("/api/atlanta-datacenters")
async def atlanta_datacenters():
    return DATACENTERS


def resolve_zip_impact(zip_code: str) -> dict:
    key = zip_code.strip()
    if key not in ZIP_IMPACT:
        key = "30318"
    return ZIP_IMPACT[key]


def resolve_zip_impact_with_key(zip_code: str) -> tuple[dict, str]:
    """Return (row, resolved_zip) — unknown zips fall back to 30318."""
    key = zip_code.strip()
    if key not in ZIP_IMPACT:
        return ZIP_IMPACT["30318"], "30318"
    return ZIP_IMPACT[key], key


def _strip_code_fence(text: str) -> str:
    t = text.strip()
    if not t.startswith("```"):
        return t
    lines = t.split("\n")
    if lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines).strip()


def _extract_json_array(raw_text: str) -> list | None:
    """Parse a JSON array from model output; tolerate code fences and extra text."""
    text = _strip_code_fence(raw_text.strip())
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            for key in ("forecast", "values", "hours", "data"):
                v = parsed.get(key)
                if isinstance(v, list):
                    return v
    except json.JSONDecodeError:
        pass
    start = text.find("[")
    while start != -1:
        try:
            arr, _end = json.JSONDecoder().raw_decode(text[start:])
            if isinstance(arr, list):
                return arr
        except json.JSONDecodeError:
            pass
        start = text.find("[", start + 1)
    return None


def _coerce_24_forecast_values(raw: list | None, history: list[float]) -> list[float]:
    if not raw:
        return _fallback_carbon_forecast(history)
    out: list[float] = []
    for x in raw[:24]:
        try:
            out.append(round(float(x), 1))
        except (TypeError, ValueError):
            tail = float(history[-1]) if history else 400.0
            out.append(round(tail, 1))
    while len(out) < 24:
        out.append(round(out[-1], 1))
    return out[:24]


def _fallback_carbon_forecast(history: list[float]) -> list[float]:
    """Deterministic diurnal shape when Groq is unavailable."""
    if not history:
        base = 400.0
    else:
        base = sum(history) / len(history)
    out: list[float] = []
    for h in range(24):
        bump = 45.0 * math.sin((h - 6) * math.pi / 12.0)
        out.append(round(max(50.0, base + bump), 1))
    return out


def groq_carbon_forecast(history: list[float]) -> list[float]:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or api_key == "PASTE_YOUR_GROQ_KEY_HERE":
        raise ValueError("GROQ_API_KEY is not configured")

    history_str = json.dumps(history)
    user = (
        "You are an energy grid analyst. Here are the last 24 hours of real carbon "
        "intensity readings (in gCO2eq/kWh) for Georgia Power's grid, starting from midnight: "
        f"{history_str}. Based on these patterns, forecast the next 24 hours of carbon intensity. "
        "Consider that solar energy typically peaks midday (reducing intensity), and evening demand "
        "typically increases intensity. Return ONLY a JSON array of 24 numbers representing hourly "
        "forecasts for the next 24 hours. No explanation, just the array."
    )

    client = _groq_client(api_key)
    try:
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": user}],
            max_tokens=800,
        )
    except Exception as e:
        raise ValueError(f"Groq API error: {e}") from e

    choice = completion.choices[0] if completion.choices else None
    raw = (choice.message.content if choice and choice.message else "") or ""
    raw = raw.strip()
    print("[Groq carbon-forecast] response:\n", raw, flush=True)
    if not raw:
        raise ValueError("Empty response from Groq")

    arr = _extract_json_array(raw)
    if arr is None:
        raise ValueError("Model did not return a parseable JSON array")
    return _coerce_24_forecast_values(arr, history)


async def _history_and_forecast_24() -> tuple[list[float], list[float]]:
    """24h real history plus 24h forecast (Groq, or fallback curve)."""
    history = await _carbon_history_24()
    try:
        forecast = await asyncio.to_thread(groq_carbon_forecast, history)
    except Exception:
        forecast = _fallback_carbon_forecast(history)
    forecast = _coerce_24_forecast_values(forecast, history)
    return history, forecast


def _extract_json_object(raw_text: str) -> dict | None:
    """Parse a JSON object from model output; tolerate leading/trailing noise."""
    text = _strip_code_fence(raw_text.strip())
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    while start != -1:
        try:
            obj, _end = json.JSONDecoder().raw_decode(text[start:])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
        start = text.find("{", start + 1)
    return None


def _bullets_from_parsed_obj(obj: dict) -> list[str] | None:
    """Accept several key shapes; return 1–3+ strings or None."""
    raw_list = None
    if "bullets" in obj and isinstance(obj["bullets"], list):
        raw_list = obj["bullets"]
    elif "ai_bullets" in obj and isinstance(obj["ai_bullets"], list):
        raw_list = obj["ai_bullets"]
    elif all(f"bullet_{i}" in obj for i in (1, 2, 3)):
        raw_list = [obj["bullet_1"], obj["bullet_2"], obj["bullet_3"]]

    if raw_list is None:
        return None
    strings: list[str] = []
    for x in raw_list:
        if isinstance(x, str) and x.strip():
            strings.append(x.strip())
        elif isinstance(x, (int, float)):
            strings.append(str(x))
    if not strings:
        return None
    while len(strings) < 3:
        strings.append(
            "Regional data center load continues to shape local grid costs and reliability.",
        )
    return strings[:3]


def _parse_groq_structured_bullets(raw_text: str) -> list[str]:
    obj = _extract_json_object(raw_text)
    if obj is None:
        raise ValueError("Model did not return valid JSON")
    bullets = _bullets_from_parsed_obj(obj)
    if bullets is None:
        raise ValueError('JSON must include a "bullets" array of 3 strings')
    return bullets


def _groq_client(api_key: str) -> Groq:
    return Groq(
        api_key=api_key,
        timeout=GROQ_TIMEOUT,
        max_retries=GROQ_MAX_RETRIES,
    )


def _groq_error_is_retryable(exc: BaseException) -> bool:
    name = type(exc).__name__
    if any(x in name for x in ("Connection", "Timeout", "ConnectError", "ReadError", "Network")):
        return True
    s = str(exc).lower()
    return any(
        w in s
        for w in (
            "connection",
            "timeout",
            "timed out",
            "network",
            "ssl",
            "resolve",
            "unreachable",
            "errno",
        )
    )


def fallback_zip_impact_bullets(
    *,
    neighborhood_name: str,
    increase_usd: int,
    datacenter_name: str,
    distance_miles: float,
    datacenter_mw: float,
) -> list[str]:
    """Template bullets when Groq is unreachable (demo / offline)."""
    mi = int(round(distance_miles))
    mw = int(round(datacenter_mw))
    return [
        (
            f"💡 Households around {neighborhood_name} are paying about "
            f"${increase_usd}/month more for electricity since 2022 — a real "
            "squeeze tied to how power is generated and delivered in the region."
        ),
        (
            f"⚡ Your nearest major data center site ({datacenter_name}, ~{mi} mi, "
            f"~{mw} MW) concentrates IT load; when the grid serves that demand, "
            "fuel and capacity costs can show up in retail rates."
        ),
        (
            "🌿 Shifting flexible usage off peak and cutting waste at home still "
            "lowers your bill and emissions while the metro adds more compute load."
        ),
    ]


def groq_zip_impact_bullets(
    *,
    neighborhood_name: str,
    increase_usd: int,
    datacenter_name: str,
    distance_miles: float,
    datacenter_mw: float,
) -> list[str]:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or api_key == "PASTE_YOUR_GROQ_KEY_HERE":
        raise ValueError(
            "GROQ_API_KEY is not configured. Set it in backend/.env",
        )

    system = (
        "You respond only with valid JSON (no markdown, no code fences, no commentary). "
        'The JSON must be a single object with exactly one key, "bullets", whose value is an array '
        "of exactly 3 strings. Each string is one short plain-English bullet for an Atlanta resident: "
        "specific, human, empathetic; start each string with one emoji; under 25 words per string. "
        'Example shape: {"bullets": ["emoji …", "emoji …", "emoji …"]}'
    )
    user = (
        "Given this data: "
        f"neighborhood={neighborhood_name}, monthly bill increase=${increase_usd}/month since 2022, "
        f"nearest data center={datacenter_name} at {distance_miles} miles consuming {datacenter_mw} MW — "
        "write exactly 3 bullets as specified in your instructions. Output only the JSON object. "
        "IMPORTANT: Only talk about electricity bills and data center energy consumption. "
        "Do not mention water, sewer, or any other utility services."
    )

    client = _groq_client(api_key)
    for attempt in range(GROQ_CALL_RETRIES):
        try:
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                max_tokens=500,
                response_format={"type": "json_object"},
            )
            choice = completion.choices[0] if completion.choices else None
            raw = (choice.message.content if choice and choice.message else "") or ""
            raw = raw.strip()
            print("[Groq zip-impact-ai] response:\n", raw, flush=True)
            if not raw:
                raise ValueError("Empty response from Groq")
            return _parse_groq_structured_bullets(raw)
        except Exception as e:
            if attempt < GROQ_CALL_RETRIES - 1 and _groq_error_is_retryable(e):
                time.sleep(GROQ_RETRY_BASE_SLEEP_S * (attempt + 1))
                continue
            raise ValueError(f"Groq API error: {e}") from e


class ZipImpactAIRequest(BaseModel):
    zip: str = Field(..., min_length=1, max_length=12)


class GeneratePostRequest(BaseModel):
    neighborhood: str = Field(..., min_length=1, max_length=240)
    bill_increase: int = Field(..., ge=0, le=50000)
    datacenter_name: str = Field(..., min_length=1, max_length=240)
    datacenter_mw: float = Field(..., ge=0, le=1_000_000)
    homes_powered: int = Field(..., ge=0, le=500_000_000)


def fallback_generate_social_post(
    *,
    neighborhood: str,
    bill_increase: int,
    datacenter_name: str,
    datacenter_mw: float,
    homes_powered: int,
) -> str:
    mw_s = f"{datacenter_mw:g}"
    return (
        f"{neighborhood}: Data center growth is hitting our bills—"
        f"${bill_increase}/mo more since 2022. Nearest major site: {datacenter_name} "
        f"({mw_s} MW, ~{homes_powered} homes equivalent). "
        "Contact Georgia PSC and your state senator today. "
        "#AtlantaEnergy #WattWatchATL #GeorgiaPower"
    )


def groq_generate_social_post(
    *,
    neighborhood: str,
    bill_increase: int,
    datacenter_name: str,
    datacenter_mw: float,
    homes_powered: int,
) -> str:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or api_key == "PASTE_YOUR_GROQ_KEY_HERE":
        raise ValueError(
            "GROQ_API_KEY is not configured. Set it in backend/.env",
        )

    user = (
        "Write a compelling 3-sentence social media post for an Atlanta resident "
        "about data center energy impact in their neighborhood. Data: "
        f"neighborhood={neighborhood}, bill increase=${bill_increase}/month since 2022, "
        f"nearest data center={datacenter_name} consuming {datacenter_mw} MW powering "
        f"{homes_powered} homes equivalent. "
        "Make it urgent, community-focused, and end with a clear call to action urging "
        "people to contact Georgia PSC or their state senator. Include "
        "#AtlantaEnergy #WattWatchATL #GeorgiaPower hashtags. "
        "Keep it under 280 characters total for X. Return only the post text, nothing else."
    )

    client = _groq_client(api_key)
    for attempt in range(GROQ_CALL_RETRIES):
        try:
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": user}],
                max_tokens=220,
            )
            choice = completion.choices[0] if completion.choices else None
            raw = (choice.message.content if choice and choice.message else "") or ""
            raw = raw.strip()
            if not raw:
                raise ValueError("Empty response from Groq")
            return raw
        except Exception as e:
            if attempt < GROQ_CALL_RETRIES - 1 and _groq_error_is_retryable(e):
                time.sleep(GROQ_RETRY_BASE_SLEEP_S * (attempt + 1))
                continue
            raise ValueError(f"Groq API error: {e}") from e
    raise ValueError("Groq API error: exhausted retries")


@app.get("/api/zip-impact/{zip}")
async def zip_impact(zip: str):
    return resolve_zip_impact(zip)


@app.post("/api/zip-impact-ai")
async def zip_impact_ai(body: ZipImpactAIRequest):
    row, resolved_zip = resolve_zip_impact_with_key(body.zip)
    neighborhood_name = row["area"]
    bill_2022 = int(row["bill_before_usd"])
    bill_current = int(row["bill_after_usd"])
    increase = bill_current - bill_2022
    datacenter_name = row["nearest_datacenter"]
    distance_miles = float(row["distance_mi"])
    datacenter_mw = float(row["datacenter_capacity_mw"])

    try:
        ai_bullets = await asyncio.to_thread(
            groq_zip_impact_bullets,
            neighborhood_name=neighborhood_name,
            increase_usd=increase,
            datacenter_name=datacenter_name,
            distance_miles=distance_miles,
            datacenter_mw=datacenter_mw,
        )
        ai_source = "groq"
    except ValueError as e:
        msg = str(e)
        if "GROQ_API_KEY" in msg:
            raise HTTPException(status_code=503, detail=msg) from e
        ai_bullets = fallback_zip_impact_bullets(
            neighborhood_name=neighborhood_name,
            increase_usd=increase,
            datacenter_name=datacenter_name,
            distance_miles=distance_miles,
            datacenter_mw=datacenter_mw,
        )
        ai_source = "fallback"

    return {
        "neighborhood_name": neighborhood_name,
        "bill_2022": bill_2022,
        "bill_current": bill_current,
        "increase": increase,
        "datacenter_name": datacenter_name,
        "distance_miles": distance_miles,
        "datacenter_mw": datacenter_mw,
        "ai_bullets": ai_bullets,
        "ai_source": ai_source,
        "resolved_zip": resolved_zip,
    }


@app.post("/api/generate-post")
async def generate_post(body: GeneratePostRequest):
    try:
        post = await asyncio.to_thread(
            groq_generate_social_post,
            neighborhood=body.neighborhood.strip(),
            bill_increase=body.bill_increase,
            datacenter_name=body.datacenter_name.strip(),
            datacenter_mw=body.datacenter_mw,
            homes_powered=body.homes_powered,
        )
        return {"post": post, "source": "groq"}
    except ValueError as e:
        msg = str(e)
        if "GROQ_API_KEY" in msg:
            raise HTTPException(status_code=503, detail=msg) from e
        post = fallback_generate_social_post(
            neighborhood=body.neighborhood.strip(),
            bill_increase=body.bill_increase,
            datacenter_name=body.datacenter_name.strip(),
            datacenter_mw=body.datacenter_mw,
            homes_powered=body.homes_powered,
        )
        return {"post": post, "source": "fallback"}
